# doc-ndserver-sync-wrk Postman Collection - Implementation Plan

**Version:** 3.0 (POC Implementation)
**Date:** 2025-10-24
**Author:** Implementation Plan based on Worker Analysis & Datadog Logs
**Status:** POC Implemented - See Discrepancies Section

---

## ⚠️ IMPORTANT: POC vs. PRODUCTION DISCREPANCIES

This plan was originally designed for a comprehensive implementation. The **POC** that has been implemented is a **simplified version** for demonstration purposes. Key differences:

### POC Simplifications:
1. **Patch Comparison**: POC sends **full document state**; production sends **only changed fields**
2. **Custom Attributes**: POC **extracts only**; production calculates **add/update/delete deltas**
3. **First-Time Sync Detection**: POC uses simplified logic (404 check only); production checks for **DocumentId, CabinetId, AND EnvUrl**
4. **Token Generation**: POC uses **TokenGenerator**; plan originally specified service-to-service-cli
5. **Collection Structure**: POC has **4 folders** (Load Sample, Scenario 1, Scenario 2, Validation); plan describes 7 folders (00-06)
6. **Discovery Workflow**: POC **does not implement** content discovery; production discovers attachments and snapshots
7. **Raw Message Parsing**: POC uses pre-formatted JSON; production parses alerts, approvals, emails from raw XML/JSON
8. **Kafka Events**: POC **cannot publish** to Kafka (Postman limitation)
9. **Document State Immutability**: Production enforces that documents **cannot revert to PENDING** state; POC does not enforce this
10. **Validation**: POC **includes comprehensive validation** with GET requests and test assertions (not in original plan)

### What POC Does Correctly:
✅ API call sequence (check existence → content root → patch metadata)
✅ Date transformation (NetDocuments format → ISO 8601)
✅ ACL mapping (VESD rights → SpiceDB relations)
✅ Subject type detection (UG-, NG-, DUCOT- prefixes)
✅ Version metadata structure
✅ Document state determination
✅ Two complete scenarios (CREATE and UPDATE)
✅ Data integrity validation

---

## TABLE OF CONTENTS

1. [Executive Summary](#executive-summary)
2. [Input Data Structure](#input-data-structure)
3. [Data Transformations](#data-transformations)
4. [API Call Sequence](#api-call-sequence)
5. [Postman Environment Setup](#postman-environment-setup)
6. [Token Management](#token-management)
7. [Collection Structure](#collection-structure)
8. [Sample NMD Messages](#sample-nmd-messages)
9. [Request Configurations](#request-configurations)
10. [Data Transformation Scripts](#data-transformation-scripts)
11. [Critical Business Logic](#critical-business-logic)
12. [API Dependencies & Sequencing](#api-dependencies--sequencing)
13. [Testing Strategy](#testing-strategy)
14. [Implementation Phases](#implementation-phases)

---

## 1. EXECUTIVE SUMMARY

The `doc-ndserver-sync-wrk` is a synchronization worker that processes NetDocuments Metadata (NMD) sync messages and ensures consistency between NetDocuments server and cloud services. It orchestrates multiple API calls to sync document metadata, versions, content, ACLs, DLP policies, and publishes events to Kafka.

### Key Capabilities

- ✅ Document metadata synchronization
- ✅ Version management (create, update, delete)
- ✅ Access Control List (ACL) synchronization
- ✅ Data Loss Prevention (DLP) policy enforcement
- ✅ Custom attributes processing
- ✅ Email properties parsing
- ✅ Content discovery and Kafka event publishing
- ✅ First-time sync detection

### Architecture Pattern

**Hexagonal Architecture (Ports & Adapters)**
- Core domain logic separated from infrastructure
- Inbound adapters: SQS message consumer
- Outbound adapters: HTTP clients for Metadata/Content APIs, Kafka producer

---

## 2. INPUT DATA STRUCTURE

### Primary Input: NmdSyncMessage

```json
{
  "type": "nmd",
  "documents": {
    "1": {
      "docProps": {
        "id": "4817-7713-8883",
        "docNum": 1,
        "status": 0,
        "name": "Document Name",
        "officialVersion": 1,
        "lastVerNo": 1,
        "contentModNum": 20251023194100777,
        "nameModNum": 20251023194100612,
        "emailProps": ""
      },
      "versions": {
        "1": {
          "verProps": {
            "verLabel": "1.0",
            "exten": "txt",
            "size": 2665,
            "created": "/Date(1761248460620)/",
            "modified": "/Date(1761248460783)/",
            "creator": "User Name",
            "creatorguid": "DUCOT-xxxxx",
            "snapshots": [
              {
                "committed": true,
                "stored": "/Date(1761248460779)/",
                "storageType": "S3SSE-VERSIONED-DOCCONTENT-QA",
                "location": "s3://bucket/path?versionId=xxx",
                "guid": "snapshot-guid",
                "bytes": 2665,
                "checksumAlgorithm": "SHA256",
                "checksum": "hash..."
              }
            ]
          }
        }
      }
    }
  },
  "envProps": {
    "envname": "~251023154100603",
    "containingcabs": ["NG-8RZI6EOH"],
    "authorguid": "DUCOT-pbs.nonadmin",
    "author": "User Name",
    "created": "/Date(1761248460603)/",
    "modified": "/Date(1761248467060)/",
    "modified by guid": "DUCOT-indexer",
    "docmodnum": 20251023194107060,
    "url": "https://ducot.netdocuments.com/Ducot3/1/1/2/9/~251023154100603.nev",
    "acl": [
      {
        "guid": "UG-LGSFSO0I",
        "rights": "VESD",
        "persistent": false
      }
    ],
    "dlp": {
      "PolicyReferences": [
        {
          "RepositoryId": "CA-WJUDJA7A",
          "PolicyIds": ["policy-id-xxx"],
          "SchemaVersion": 1
        }
      ]
    },
    "foldertree": ["/path/to/folders"],
    "parentfolder": "/parent/folder"
  },
  "Traceparent": "00-trace-id-xxx-01"
}
```

### Key Components

| Field | Description | Example |
|-------|-------------|---------|
| `documentId` | 12-digit document identifier | `4817-7713-8883` |
| `cabinetId` | Cabinet identifier | `NG-8RZI6EOH` |
| `versions` | Collection of document versions | `{ "1": {...}, "2": {...} }` |
| `acl` | Access control list entries | `[{guid, rights, persistent}]` |
| `dlp` | DLP policy references | `{PolicyReferences: [...]}` |
| `customAttributes` | Dynamic properties | `cp|CA-xxx|key: value` |
| `foldertree` | Document folder hierarchy | `["/path1/path2"]` |

---

## 3. DATA TRANSFORMATIONS

### 3.1 Date Format Conversion

**Input:** `/Date(1761248460620)/` (NetDocuments format)
**Output:** `2025-10-23T19:41:00.620Z` (ISO 8601)

```javascript
function convertNetDocumentsDate(dateStr) {
    const timestamp = dateStr.match(/\d+/)[0];
    return new Date(parseInt(timestamp)).toISOString();
}
```

### 3.2 Document State Calculation

Based on NMD status flags (bitwise operations):

```javascript
const NmdDocStatusFlags = {
    Archived: 1,
    Autoversion: 2,
    CheckedOut: 4,
    Locked: 8,
    CollabEdit: 16
};

function convertNmdToDocumentState(nmdMessage) {
    const isDeleted = nmdMessage.documents['1']?.docProps?.deleted === true;
    const status = nmdMessage.documents['1']?.docProps?.status || 0;
    const isArchived = (status & NmdDocStatusFlags.Archived) !== 0;

    if (isDeleted) return 'DELETED';
    if (isArchived) return 'ARCHIVED';
    return 'ACTIVE';
}
```

**States:** `PENDING`, `ACTIVE`, `ARCHIVED`, `DELETED`

### 3.3 ACL Transformation

**NetDocuments ACL → SpiceDB Relationship Format**

```javascript
function transformAcl(nmdAcl) {
    const rightsMap = {
        'V': 'viewer',
        'E': 'editor',
        'S': 'sharer',
        'D': 'administrator',
        'Z': 'default'  // Cabinet default rights
    };

    return nmdAcl.map(entry => {
        const relations = entry.rights.split('').map(r => rightsMap[r]);

        return {
            SubjectType: determineSubjectType(entry.guid),  // user, group, cabinet
            SubjectId: entry.guid,
            Relations: relations
        };
    });
}

function determineSubjectType(guid) {
    if (guid.startsWith('UG-')) return 'group';
    if (guid.startsWith('NG-')) return 'cabinet';
    if (guid.startsWith('DUCOT-')) return 'user';
    return 'user';  // default
}
```

### 3.4 DLP Information Extraction

```javascript
function buildDlpInformation(dlpInfo, classificationInfo) {
    let repositoryId = '';
    let policyId = '';
    let classificationId = '';

    if (dlpInfo?.PolicyReferences?.length > 0) {
        const ref = dlpInfo.PolicyReferences[0];
        repositoryId = ref.RepositoryId || '';
        policyId = ref.PolicyIds?.[0] || '';
    }

    if (classificationInfo?.DataClassificationId) {
        classificationId = classificationInfo.DataClassificationId;
    }

    return { repositoryId, policyId, classificationId };
}
```

### 3.5 Custom Attributes Processing

```javascript
function extractCustomAttributes(nmdMessage) {
    const docProps = nmdMessage.documents['1']?.docProps || {};
    const customAttrs = [];

    // Extract properties starting with "cp|"
    for (const [key, value] of Object.entries(docProps)) {
        if (key.startsWith('cp|')) {
            // Format: cp|CA-CABID|attrKey
            const parts = key.split('|');
            if (parts.length === 3) {
                customAttrs.push({
                    Key: parts[2],
                    Values: [value],
                    IsDeleted: false
                });
            }
        }
    }

    return customAttrs;
}
```

### 3.6 Version Metadata Builder

```javascript
function transformVersions(nmdMessage) {
    const versions = nmdMessage.documents['1']?.versions || {};
    const patchVersionsList = [];

    for (const [versionId, versionData] of Object.entries(versions)) {
        const props = versionData.verProps;

        patchVersionsList.push({
            VersionId: parseInt(versionId),
            Name: versionId,
            Description: props.description || '',
            Extension: props.exten,
            Label: props.verLabel,
            Size: props.size,
            Locked: props.locked || false,
            DeliveryRevoked: props.deliveryRevoked || false,
            Created: {
                UserId: props.creatorguid,
                Timestamp: convertNetDocumentsDate(props.created)
            },
            Modified: {
                UserId: props.modifiedByGuid,
                Timestamp: convertNetDocumentsDate(props.modified)
            },
            State: props.deleted ? 'DELETED' : 'ACTIVE',
            CopiedFrom: props.copiedFrom || null,
            LegacySignatures: null
        });
    }

    return patchVersionsList;
}
```

---

## 4. API CALL SEQUENCE

### PHASE 1: Pre-Sync Validation

**API Call 1: Check Document Existence**

```
GET {{metadataBaseUrl}}/v1/documents/extended/{{documentId}}
Authorization: Bearer {{metadataToken}}
Content-Type: application/json

Purpose: Determine if document exists and retrieve current state
Response: ExtendedDocument object or 404
```

**Decision Point:**
- If 200 → Document exists, update mode
- If 404 → Document doesn't exist, create mode

---

### PHASE 2: Content Service Setup

**API Call 2: Update Document Root**

```
PUT {{contentBaseUrl}}/v1/content/{{documentId}}/metadata
Authorization: Bearer {{contentToken}}
Content-Type: application/json

Body:
{
  "documentRoot": ["NG-8RZI6EOH/documents"],
  "source": "doc-ndserver-sync-wrk"
}

Purpose: Configure content storage location structure
```

---

### PHASE 3: Metadata Synchronization (MAIN)

**API Call 3: Patch Extended Document**

```
PATCH {{metadataBaseUrl}}/v1/documents/extended/{{documentId}}
Authorization: Bearer {{metadataToken}}
Content-Type: application/json

Body: {{patchRequest}}  // See section 10 for complete structure
```

**PatchDocumentRequest Structure:**

```json
{
  "DocumentId": "4817-7713-8883",
  "CabinetId": "NG-8RZI6EOH",
  "Name": "Document Name",
  "State": "ACTIVE",
  "OfficialVersion": 1,
  "NextVersion": 2,
  "EnvUrl": "/Ducot3/1/1/2/9/~251023154100603.nev",
  "ParentFolders": ["/folder/path"],
  "AclFreeze": false,
  "Language": "en",
  "DocModNum": 20251023194107060,
  "NameModNum": 20251023194100612,
  "ContentModNum": 20251023194100777,
  "DocNum": 1,
  "Created": {
    "UserId": "DUCOT-pbs.nonadmin",
    "Timestamp": "2025-10-23T19:41:00.603Z"
  },
  "Modified": {
    "UserId": "DUCOT-indexer",
    "Timestamp": "2025-10-23T19:41:07.060Z"
  },
  "CheckedOut": {
    "UserId": null,
    "Timestamp": null,
    "Comment": null,
    "CollaborationEdit": null,
    "CollaborationEditType": null
  },
  "Locked": {
    "UserId": null,
    "Comment": null,
    "Timestamp": null
  },
  "LinkedDocuments": [],
  "CustomAttributes": [
    {
      "Key": "100",
      "Values": ["value"],
      "IsDeleted": false
    }
  ],
  "Versions": [
    {
      "VersionId": 1,
      "Name": "1",
      "Description": "",
      "Extension": "txt",
      "Label": "1.0",
      "Size": 2665,
      "Locked": false,
      "DeliveryRevoked": false,
      "Created": {
        "UserId": "DUCOT-pbs.nonadmin",
        "Timestamp": "2025-10-23T19:41:00.620Z"
      },
      "Modified": {
        "UserId": "DUCOT-pbs.nonadmin",
        "Timestamp": "2025-10-23T19:41:00.783Z"
      },
      "State": "ACTIVE",
      "CopiedFrom": null,
      "LegacySignatures": null
    }
  ],
  "Acl": [
    {
      "SubjectType": "group",
      "SubjectId": "UG-LGSFSO0I",
      "Relations": ["viewer", "editor", "sharer", "administrator"]
    },
    {
      "SubjectType": "user",
      "SubjectId": "DUCOT-pbs.nonadmin",
      "Relations": ["viewer", "editor", "sharer", "administrator"]
    }
  ],
  "RepositoryId": "",
  "PolicyId": "",
  "ClassificationId": "",
  "FolderTree": ["/path/to/folders"],
  "Email": null,
  "EmailAttachments": [],
  "DeletedCabinets": [],
  "Alerts": [],
  "Approval": null
}
```

---

### PHASE 4: Discovery (First-Time Sync Only)

**Condition:** `isNewDocument === true` (first time syncing this document)

**API Call 4A: Get Document Attachments**

```
GET {{contentBaseUrl}}/v1/content/{{documentId}}/attachments
Authorization: Bearer {{contentToken}}

Purpose: Discover document-level attachments
Response: Paginated list of DocumentAttachment
```

**API Call 4B: Get Version Attachments** (per version)

```
GET {{contentBaseUrl}}/v1/content/{{documentId}}/versions/{{versionId}}/attachments
Authorization: Bearer {{contentToken}}

Purpose: Discover version-level attachments
Response: Paginated list of VersionAttachment
```

**API Call 4C: Get Snapshots** (per version)

```
GET {{contentBaseUrl}}/v1/content/{{documentId}}/versions/{{versionId}}/snapshots
Authorization: Bearer {{contentToken}}

Purpose: Discover document snapshots/renditions
Response: Paginated list of Snapshot
```

---

### PHASE 5: Event Publishing (Kafka)

**Note:** Postman cannot directly publish to Kafka. Events will be logged to console for verification.

**Event Structure:**

```json
{
  "specversion": "1.0",
  "type": "com.netdocuments.documents.content.snapshot.created.v1",
  "source": "doc-ndserver-sync-wrk",
  "id": "uuid",
  "time": "2025-10-23T19:41:08.354Z",
  "datacontenttype": "application/json",
  "data": {
    "CabinetId": "NG-8RZI6EOH",
    "DocumentId": "4817-7713-8883",
    "EntityId": "snapshot-id",
    "VersionId": 1,
    "IsOfficialVersion": true,
    "ParentFolders": [],
    "New": {
      "Length": 2665,
      "Type": "Snapshot",
      "VersionId": 1,
      "Created": {...},
      "Filename": "document.txt",
      "MimeType": "text/plain",
      "Extension": "txt"
    },
    "ChangedFields": ["Length", "Type", "Created", ...]
  }
}
```

---

## 5. POSTMAN ENVIRONMENT SETUP

### Environment: `doc-ndserver-sync-wrk - [QA]`

```json
{
  "id": "generated-uuid",
  "name": "doc-ndserver-sync-wrk - [QA]",
  "values": [
    {
      "key": "metadataBaseUrl",
      "value": "http://doc-metadata-api-svc.lb.service",
      "type": "default",
      "description": "Base URL for metadata service API",
      "enabled": true
    },
    {
      "key": "contentBaseUrl",
      "value": "http://doc-content-api-svc.lb.service",
      "type": "default",
      "description": "Base URL for content service API",
      "enabled": true
    },
    {
      "key": "aclBaseUrl",
      "value": "http://sec-acl-api-svc.lb.service",
      "type": "default",
      "description": "Base URL for ACL service API",
      "enabled": true
    },
    {
      "key": "metadataToken",
      "value": "",
      "type": "secret",
      "description": "Bearer token for metadata service (audience: doc-metadata-api-svc)",
      "enabled": true
    },
    {
      "key": "contentToken",
      "value": "",
      "type": "secret",
      "description": "Bearer token for content service (audience: doc-content-api-svc)",
      "enabled": true
    },
    {
      "key": "aclToken",
      "value": "",
      "type": "secret",
      "description": "Bearer token for ACL service (audience: sec-acl-api-svc)",
      "enabled": true
    },
    {
      "key": "documentId",
      "value": "",
      "type": "any",
      "description": "Current document ID being processed",
      "enabled": true
    },
    {
      "key": "cabinetId",
      "value": "",
      "type": "any",
      "description": "Current cabinet ID being processed",
      "enabled": true
    },
    {
      "key": "nmdMessage",
      "value": "",
      "type": "any",
      "description": "Full NMD sync message (JSON string)",
      "enabled": true
    },
    {
      "key": "patchRequest",
      "value": "",
      "type": "any",
      "description": "Transformed patch request (JSON string)",
      "enabled": true
    },
    {
      "key": "isNewDocument",
      "value": "false",
      "type": "any",
      "description": "Flag indicating if this is a first-time sync",
      "enabled": true
    },
    {
      "key": "existingDocument",
      "value": "",
      "type": "any",
      "description": "Existing extended document from metadata API",
      "enabled": true
    },
    {
      "key": "sample_simple_document",
      "value": "",
      "type": "any",
      "description": "Sample: Simple document with 1 version",
      "enabled": true
    },
    {
      "key": "sample_dlp_policy",
      "value": "",
      "type": "any",
      "description": "Sample: Document with DLP policies",
      "enabled": true
    },
    {
      "key": "sample_custom_attributes",
      "value": "",
      "type": "any",
      "description": "Sample: Document with custom attributes",
      "enabled": true
    },
    {
      "key": "sample_folder_tree",
      "value": "",
      "type": "any",
      "description": "Sample: Document in folder hierarchy",
      "enabled": true
    },
    {
      "key": "sample_multiple_versions",
      "value": "",
      "type": "any",
      "description": "Sample: Document with 3+ versions",
      "enabled": true
    }
  ]
}
```

---

## 6. TOKEN MANAGEMENT

### Obtaining S2S Tokens

**⚠️ POC IMPLEMENTATION:** The POC uses **TokenGenerator** instead of service-to-service-cli.

**Before running the collection, manually obtain tokens:**

**1. Metadata Service Token:**
```bash
# Navigate to TokenGenerator
cd /home/xmarchena/code/TokenGenerator

# Get Metadata Service Token
dotnet run doc-metadata-api-svc doc-metadata-api-svc "service.create service.read service.update service.delete"

# Copy the token output
```

**2. Content Service Token:**
```bash
# Navigate to TokenGenerator (if not already there)
cd /home/xmarchena/code/TokenGenerator

# Get Content Service Token
dotnet run doc-content-api-svc doc-content-api-svc "service.create service.read service.update service.delete"

# Copy the token output
```

**3. ACL Service Token:**
```bash
# Navigate to TokenGenerator (if not already there)
cd /home/xmarchena/code/TokenGenerator

# Get ACL Service Token
dotnet run sec-acl-api-svc sec-acl-api-svc "service.write.relationships"

# Copy the token output
```

### Token Setup Workflow

1. Run the dotnet commands above
2. Copy the token output from console
3. Open Postman → Environments
4. Select "doc-ndserver-sync-wrk - POC [QA]"
5. Paste tokens into respective variables (`metadataToken`, `contentToken`, `aclToken`)
6. Save the environment

**Token Expiration:** Tokens typically expire after 12 hours. Refresh before running tests.

---

### Alternative: Using service-to-service-cli (Original Plan)

The original plan specified using service-to-service-cli:

```bash
/home/xmarchena/code/idp-docker-utils/service-to-service-cli/service-to-service-cli \
  auth get-access-token \
  --audience doc-metadata-api-svc \
  --scope "service.create service.read service.update service.delete"
```

**Note:** Either method works. The POC documentation uses TokenGenerator for consistency.

---

## 7. COLLECTION STRUCTURE

### 7.1 POC Implementation (Actual)

**⚠️ POC IMPLEMENTATION:** The POC has a simplified 4-folder structure for demonstration purposes.

```
doc-ndserver-sync-wrk - POC (Two Scenarios + Validation)
│
├── 📁 01 - Load Sample Document
│   └── 📄 Load Sample: Simple Document
│       ├── Pre-request: Generates dynamic document ID (XXXX-XXXX-XXXX)
│       ├── Body: sample_simple_document from environment
│       └── Sets: nmdMessage, documentId, cabinetId
│
├── 📁 02 - SCENARIO 1: New Document Creation
│   │   (Tests first-time sync: 404 → CREATE)
│   │
│   ├── 📄 Step 1: Check Document Existence
│   │   ├── GET {{metadataBaseUrl}}/v1/documents/extended/{{documentId}}
│   │   ├── Expected: 404 Not Found
│   │   └── Sets: isNewDocument = true
│   │
│   ├── 📄 Step 2: Configure Content Root
│   │   ├── PUT {{contentBaseUrl}}/v1/content/{{documentId}}/metadata
│   │   ├── Body: { documentRoot: ["NG-8RZI6EOH/documents"], source: "..." }
│   │   └── Expected: 204 No Content
│   │
│   ├── 📄 Step 3: Build CREATE Patch Request
│   │   ├── Pre-request: Full NMD → PatchRequest transformation
│   │   └── Sets: patchRequest with complete document metadata
│   │
│   └── 📄 Step 4: CREATE Document
│       ├── PATCH {{metadataBaseUrl}}/v1/documents/extended/{{documentId}}
│       ├── Body: {{patchRequest}}
│       └── Expected: 200 OK with created document
│
├── 📁 03 - SCENARIO 2: Document Update
│   │   (Tests existing document update: 200 → UPDATE)
│   │
│   ├── 📄 Step 1: Check Document Existence
│   │   ├── GET {{metadataBaseUrl}}/v1/documents/extended/{{documentId}}
│   │   ├── Expected: 200 OK (document now exists)
│   │   └── Sets: isNewDocument = false, existingDocument
│   │
│   ├── 📄 Step 2: Update Content Root
│   │   ├── PUT {{contentBaseUrl}}/v1/content/{{documentId}}/metadata
│   │   └── Expected: 204 No Content
│   │
│   ├── 📄 Step 3: Build UPDATE Patch Request
│   │   ├── Pre-request: Simulates changes (name += " [UPDATED]", timestamps)
│   │   └── Sets: patchRequest with updated metadata
│   │
│   └── 📄 Step 4: UPDATE Document
│       ├── PATCH {{metadataBaseUrl}}/v1/documents/extended/{{documentId}}
│       ├── Body: {{patchRequest}}
│       └── Expected: 200 OK with updated document
│
└── 📁 04 - Validation
    │   (Verifies data integrity after both scenarios)
    │
    ├── 📄 Validate Document Metadata
    │   ├── GET {{metadataBaseUrl}}/v1/documents/extended/{{documentId}}
    │   └── Tests: Document exists, ID matches, state=ACTIVE, name updated, EnvUrl set
    │
    ├── 📄 Validate Versions
    │   ├── GET {{metadataBaseUrl}}/v1/documents/extended/{{documentId}}
    │   └── Tests: Version 1 exists, extension/label/state correct, timestamps present
    │
    ├── 📄 Validate ACL
    │   ├── GET {{metadataBaseUrl}}/v1/documents/extended/{{documentId}}
    │   └── Tests: 2 ACL entries, group/user entries correct, VESD relations mapped
    │
    ├── 📄 Validate ModNums
    │   ├── GET {{metadataBaseUrl}}/v1/documents/extended/{{documentId}}
    │   └── Tests: DocModNum incremented in Scenario 2, timestamps present
    │
    └── 📄 Validation Summary
        ├── GET {{metadataBaseUrl}}/v1/documents/extended/{{documentId}}
        └── Console: Comprehensive final state summary
```

**Key Features:**
- ✅ Dynamic document ID generation (no conflicts on repeated runs)
- ✅ Two complete scenarios (CREATE and UPDATE)
- ✅ Comprehensive validation with test assertions
- ✅ Console logging for debugging
- ✅ Newman CLI compatible

---

### 7.2 Original Plan (Comprehensive)

The original plan described a more comprehensive 7-folder structure:

```
doc-ndserver-sync-wrk Collection (Original Plan)
│
├── 📁 00-Setup-&-Documentation
├── 📁 01-Sample-NMD-Messages (5 samples)
├── 📁 02-Full-Sync-Workflow (4 steps)
├── 📁 03-Discovery-Workflow (conditional, 3 requests)
├── 📁 04-Transformation-Library (8 shared scripts)
├── 📁 05-Supporting-API-Calls (6 API helpers)
└── 📁 06-Test-Scenarios (8 test scenarios)
```

**Note:** The POC implements the essential workflow only. The comprehensive structure can be built in future phases.

---

## 8. SAMPLE NMD MESSAGES

### Extracted from Production Logs (Datadog)

The following sample messages have been extracted from actual production logs and are available in the environment variables:

#### Sample 1: Simple Document (`sample_simple_document`)

**Document ID:** `4817-7713-8883`
**Characteristics:**
- Single version (v1)
- Basic ACL (user + group)
- No DLP policies
- No custom attributes
- No folder tree

**Use Case:** Testing basic document synchronization flow

---

#### Sample 2: Document with DLP Policies (`sample_dlp_policy`)

**Document ID:** `4816-0936-6723`
**Characteristics:**
- DLP policy applied
- Repository and policy IDs present
- Cabinet-level ACL
- Collaboration space reference

**Use Case:** Testing DLP policy synchronization and ACL with cabinet

**DLP Structure:**
```json
"dlp": {
  "PolicyReferences": [
    {
      "RepositoryId": "CA-WJUDJA7A",
      "PolicyIds": ["21912e32-fb66-48a1-9718-8ecbbcfac470"],
      "SchemaVersion": 1
    }
  ]
}
```

---

#### Sample 3: Document with Custom Attributes (`sample_custom_attributes`)

**Document ID:** `4816-0936-6723`
**Characteristics:**
- Multiple custom properties (`cp|CA-xxx|key`)
- Origin document tracking
- Custom attribute values

**Use Case:** Testing custom attribute extraction and synchronization

**Custom Attributes:**
```json
"cp|CA-WJUDJA7A|2": "001",
"cp|CA-WJUDJA7A|1": "001"
```

---

#### Sample 4: Document in Folder Tree (`sample_folder_tree`)

**Document ID:** `4816-5969-8371`
**Characteristics:**
- Nested folder structure
- Parent folder reference
- Folder tree processed flag
- .ndfld extension (folder document)

**Use Case:** Testing folder hierarchy synchronization

**Folder Structure:**
```json
"foldertree": [
  "/ducot3/7/g/v/2/^f251023154014790.nev|/ducot4/4/g/m/7/^f251023154037387.nev|/ducot4/v/z/d/i/^f251023154052834.nev"
],
"parentfolder": "/Ducot4/v/z/d/i/^F251023154052834.nev"
```

---

#### Sample 5: Document with Multiple Versions (`sample_multiple_versions`)

**Document ID:** `4835-7223-5459`
**Characteristics:**
- 3 versions (v1, v2, v3)
- Version parent relationships
- Official version tracking
- Multiple snapshots

**Use Case:** Testing multi-version synchronization and version history

**Version Structure:**
```json
"versions": {
  "1": { "verProps": {...} },
  "2": { "verProps": { "parent": 1, ... } },
  "3": { "verProps": { "parent": 2, ... } }
}
```

---

### Loading Samples into Environment

**Pre-request Script for Sample Loading:**

```javascript
// Example: Load simple document sample
const sampleData = `
{
  "type": "nmd",
  "documents": {...},
  "envProps": {...}
}
`;

pm.environment.set('nmdMessage', sampleData);
console.log('✅ Loaded sample: Simple Document');
```

---

## 9. REQUEST CONFIGURATIONS

### Step 1: Check Document Existence

**Request Configuration:**

```
Method: GET
URL: {{metadataBaseUrl}}/v1/documents/extended/{{documentId}}
Headers:
  Authorization: Bearer {{metadataToken}}
  Content-Type: application/json
```

**Pre-request Script:**

```javascript
// Ensure documentId is set
const nmdMessage = JSON.parse(pm.environment.get('nmdMessage') || '{}');
const documentId = nmdMessage.documents?.['1']?.docProps?.id;

if (documentId) {
    pm.environment.set('documentId', documentId);
    console.log(`✅ Document ID: ${documentId}`);
} else {
    console.error('❌ No document ID found in NMD message');
}
```

**Tests (Post-response Script):**

```javascript
const responseCode = pm.response.code;

pm.test("Status code is 200 or 404", function () {
    pm.expect(responseCode).to.be.oneOf([200, 404]);
});

if (responseCode === 200) {
    const extendedDoc = pm.response.json();
    pm.environment.set('existingDocument', JSON.stringify(extendedDoc));
    pm.environment.set('isNewDocument', 'false');
    console.log('✅ Document exists - Update mode');
    console.log(`   State: ${extendedDoc.State}`);
    console.log(`   Versions: ${extendedDoc.Versions?.length || 0}`);
} else if (responseCode === 404) {
    pm.environment.set('existingDocument', '');
    pm.environment.set('isNewDocument', 'true');
    console.log('✅ Document not found - Create mode');
}
```

---

### Step 2: Update Content Document Root

**Request Configuration:**

```
Method: PUT
URL: {{contentBaseUrl}}/v1/content/{{documentId}}/metadata
Headers:
  Authorization: Bearer {{contentToken}}
  Content-Type: application/json
Body (raw JSON):
{
  "documentRoot": {{documentRoot}},
  "source": "doc-ndserver-sync-wrk"
}
```

**Pre-request Script:**

```javascript
// Build documentRoot from NMD message
const nmdMessage = JSON.parse(pm.environment.get('nmdMessage'));
const cabinetId = nmdMessage.envProps.containingcabs[0];

// Extract cabinet structure from envelope URL or use default
// Format: ["NG-CABID/documents"]
const documentRoot = [`${cabinetId}/documents`];

pm.environment.set('documentRoot', JSON.stringify(documentRoot));
pm.environment.set('cabinetId', cabinetId);

console.log(`✅ Document Root: ${JSON.stringify(documentRoot)}`);
```

**Tests:**

```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

console.log('✅ Content document root updated');
```

---

### Step 3: Build Patch Request

**This is a dummy request that only runs a pre-request script to build the patch request.**

**Pre-request Script:** (See section 10 for complete transformation logic)

```javascript
// This script transforms NMD message → PatchRequest
// See "10. DATA TRANSFORMATION SCRIPTS" for full implementation

const nmdMessage = JSON.parse(pm.environment.get('nmdMessage'));
const existingDocument = pm.environment.get('existingDocument')
    ? JSON.parse(pm.environment.get('existingDocument'))
    : null;

// Build complete patch request
const patchRequest = buildPatchRequest(nmdMessage, existingDocument);

pm.environment.set('patchRequest', JSON.stringify(patchRequest));
console.log('✅ Patch request built');
console.log(JSON.stringify(patchRequest, null, 2));
```

---

### Step 4: Patch Extended Document

**Request Configuration:**

```
Method: PATCH
URL: {{metadataBaseUrl}}/v1/documents/extended/{{documentId}}
Headers:
  Authorization: Bearer {{metadataToken}}
  Content-Type: application/json
Body (raw):
{{patchRequest}}
```

**Tests:**

```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Response has documentId", function () {
    const response = pm.response.json();
    pm.expect(response).to.have.property('documentId');
    pm.expect(response.documentId).to.eql(pm.environment.get('documentId'));
});

console.log('✅ Document metadata synchronized successfully');

// Log key fields updated
const response = pm.response.json();
console.log(`   State: ${response.State}`);
console.log(`   Versions: ${response.Versions?.length || 0}`);
console.log(`   ACL Entries: ${response.Acl?.length || 0}`);
console.log(`   Custom Attributes: ${response.CustomAttributes?.length || 0}`);
```

---

## 10. DATA TRANSFORMATION SCRIPTS

### Complete NMD → Patch Request Transformer

```javascript
/**
 * Master transformation function
 * Converts NMD sync message to PatchDocumentRequest
 */
function buildPatchRequest(nmdMessage, existingDocument) {
    // Extract core data
    const doc = nmdMessage.documents['1'];
    const docProps = doc.docProps;
    const envProps = nmdMessage.envProps;

    // Determine document state
    const documentState = calculateDocumentState(nmdMessage, existingDocument);

    // Build versions
    const versions = buildVersionsList(doc.versions);

    // Build ACL
    const acl = buildAcl(envProps.acl);

    // Extract DLP info
    const { repositoryId, policyId, classificationId } = buildDlpInfo(envProps);

    // Extract custom attributes
    const customAttributes = extractCustomAttributes(docProps);

    // Build patch request
    const patchRequest = {
        DocumentId: docProps.id,
        CabinetId: envProps.containingcabs[0],
        Name: processPatchProperty(docProps.name, existingDocument?.Name),
        State: documentState,
        OfficialVersion: processPatchProperty(docProps.officialVersion, existingDocument?.OfficialVersion),
        NextVersion: processPatchProperty(docProps.nextVersion || docProps.lastVerNo + 1, existingDocument?.NextVersion),
        EnvUrl: processPatchProperty(envProps.url, existingDocument?.EnvUrl),
        ParentFolders: envProps.jumbofolders ? [envProps.parentfolder] : (envProps.parentfolder ? [envProps.parentfolder] : []),
        FolderTree: envProps.foldertree || [],
        AclFreeze: processPatchProperty(docProps.aclFreeze, existingDocument?.AclFreeze),
        Language: processPatchProperty(docProps.language, existingDocument?.Language),
        DocModNum: convertToModNum(envProps.docmodnum),
        NameModNum: convertToModNum(docProps.nameModNum),
        ContentModNum: convertToModNum(docProps.contentModNum),
        DocNum: processPatchProperty(docProps.docNum, existingDocument?.DocNum),
        Created: {
            UserId: envProps.authorguid,
            Timestamp: convertNetDocumentsDate(envProps.created)
        },
        Modified: {
            UserId: envProps['modified by guid'],
            Timestamp: convertNetDocumentsDate(envProps.modified)
        },
        CheckedOut: buildCheckedOutInfo(docProps),
        Locked: buildLockedInfo(docProps),
        LinkedDocuments: buildLinkedDocuments(docProps.links),
        CustomAttributes: processCustomAttributes(customAttributes, existingDocument?.CustomAttributes),
        Versions: versions,
        Acl: acl,
        RepositoryId: repositoryId,
        PolicyId: policyId,
        ClassificationId: classificationId,
        DeletedCabinets: [],
        Alerts: [],
        Approval: null,
        Email: null,
        EmailAttachments: []
    };

    // Process archived and autoversion from status flags
    const status = docProps.status || 0;
    if (status > 0) {
        const isArchived = (status & 1) !== 0;
        const isAutoVersion = (status & 2) !== 0;

        patchRequest.Archived = processPatchProperty(isArchived, existingDocument?.Archived);
        patchRequest.AutoVersion = processPatchProperty(isAutoVersion, existingDocument?.AutoVersion);
    }

    return patchRequest;
}

/**
 * Calculate document state
 */
function calculateDocumentState(nmdMessage, existingDocument) {
    const docProps = nmdMessage.documents['1'].docProps;
    const isDeleted = docProps.deleted === true;
    const status = docProps.status || 0;
    const isArchived = (status & 1) !== 0;

    let documentState = 'ACTIVE';

    if (isDeleted) {
        documentState = 'DELETED';
    } else if (isArchived) {
        documentState = 'ARCHIVED';
    }

    // CRITICAL LOGIC: Document cannot go back to PENDING once it's been set to another state
    if (existingDocument?.State && existingDocument.State !== 'PENDING' && documentState === 'PENDING') {
        documentState = existingDocument.State;
    }

    return documentState;
}

/**
 * Build versions list
 */
function buildVersionsList(versions) {
    const versionsList = [];

    for (const [versionId, versionData] of Object.entries(versions || {})) {
        const props = versionData.verProps;

        versionsList.push({
            VersionId: parseInt(versionId),
            Name: versionId,
            Description: props.description || '',
            Extension: props.exten,
            Label: props.verLabel,
            Size: props.size,
            Locked: props.locked || false,
            DeliveryRevoked: props.deliveryRevoked || false,
            Created: {
                UserId: props.creatorguid,
                Timestamp: convertNetDocumentsDate(props.created)
            },
            Modified: {
                UserId: props.modifiedByGuid || props.creatorguid,
                Timestamp: convertNetDocumentsDate(props.modified || props.created)
            },
            State: props.deleted ? 'DELETED' : 'ACTIVE',
            CopiedFrom: props.copiedFrom || null,
            LegacySignatures: null
        });
    }

    return versionsList;
}

/**
 * Build ACL
 */
function buildAcl(nmdAcl) {
    const rightsMap = {
        'V': 'viewer',
        'E': 'editor',
        'S': 'sharer',
        'D': 'administrator',
        'Z': 'default'
    };

    return (nmdAcl || []).map(entry => {
        const relations = entry.rights.split('').map(r => rightsMap[r]).filter(Boolean);

        return {
            SubjectType: determineSubjectType(entry.guid),
            SubjectId: entry.guid,
            Relations: relations
        };
    });
}

/**
 * Determine subject type from GUID
 */
function determineSubjectType(guid) {
    if (guid.startsWith('UG-')) return 'group';
    if (guid.startsWith('NG-') || guid.startsWith('CA-')) return 'cabinet';
    if (guid.startsWith('DUCOT-')) return 'user';
    return 'user';
}

/**
 * Build DLP info
 */
function buildDlpInfo(envProps) {
    let repositoryId = '';
    let policyId = '';
    let classificationId = '';

    if (envProps.dlp?.PolicyReferences?.length > 0) {
        const ref = envProps.dlp.PolicyReferences[0];
        repositoryId = ref.RepositoryId || '';
        policyId = ref.PolicyIds?.[0] || '';
    }

    if (envProps.classificationInfo?.DataClassificationId) {
        classificationId = envProps.classificationInfo.DataClassificationId;
    }

    return { repositoryId, policyId, classificationId };
}

/**
 * Extract custom attributes from doc properties
 */
function extractCustomAttributes(docProps) {
    const customAttrs = [];

    for (const [key, value] of Object.entries(docProps)) {
        if (key.startsWith('cp|')) {
            const parts = key.split('|');
            if (parts.length === 3) {
                customAttrs.push({
                    Key: parts[2],
                    Values: [String(value)],
                    IsDeleted: false
                });
            }
        }
    }

    return customAttrs;
}

/**
 * Process custom attributes with comparison
 */
function processCustomAttributes(nmdAttributes, existingAttributes) {
    if (!nmdAttributes || nmdAttributes.length === 0) {
        return null;  // No changes
    }

    if (!existingAttributes) {
        return nmdAttributes;  // All new
    }

    // Build comparison maps
    const nmdMap = new Map(nmdAttributes.map(a => [a.Key, a.Values]));
    const existingMap = new Map(existingAttributes.map(a => [a.Key, a.Values]));
    const result = [];

    // Find added or updated attributes
    for (const [key, values] of nmdMap) {
        const existingValues = existingMap.get(key);
        if (!existingValues || !arraysEqual(values, existingValues)) {
            result.push({ Key: key, Values: values, IsDeleted: false });
        }
    }

    // Find deleted attributes
    for (const [key, values] of existingMap) {
        if (!nmdMap.has(key)) {
            result.push({ Key: key, Values: values, IsDeleted: true });
        }
    }

    return result.length > 0 ? result : null;
}

/**
 * Process patch property (only include if changed)
 */
function processPatchProperty(nmdValue, existingValue) {
    if (nmdValue === null || nmdValue === undefined) {
        return null;
    }

    if (nmdValue === existingValue) {
        return null;  // No change
    }

    return nmdValue;
}

/**
 * Convert NetDocuments date format
 */
function convertNetDocumentsDate(dateStr) {
    if (!dateStr) return null;
    const match = dateStr.match(/\d+/);
    if (!match) return null;
    return new Date(parseInt(match[0])).toISOString();
}

/**
 * Convert to ModNum format (yyyyMMddHHmmssfff)
 */
function convertToModNum(value) {
    if (!value) return null;
    return parseInt(value);
}

/**
 * Build checked out info
 */
function buildCheckedOutInfo(docProps) {
    const status = docProps.status || 0;
    const isCheckedOut = (status & 4) !== 0;

    if (isCheckedOut) {
        return {
            UserId: docProps.actionBy || null,
            Timestamp: convertNetDocumentsDate(docProps.actionDate),
            Comment: docProps.actionComment || null,
            CollaborationEdit: (status & 16) !== 0,
            CollaborationEditType: docProps.collaborationEditType || null
        };
    }

    return {
        UserId: null,
        Timestamp: null,
        Comment: null,
        CollaborationEdit: null,
        CollaborationEditType: null
    };
}

/**
 * Build locked info
 */
function buildLockedInfo(docProps) {
    const status = docProps.status || 0;
    const isLocked = (status & 8) !== 0;

    if (isLocked && docProps.lockDocumentModel) {
        try {
            const lockModel = JSON.parse(docProps.lockDocumentModel);
            return {
                UserId: lockModel.ActionBy || null,
                Comment: lockModel.Comment || null,
                Timestamp: convertNetDocumentsDate(lockModel.ActionDate)
            };
        } catch (e) {
            // Invalid lock model
        }
    }

    return {
        UserId: null,
        Comment: null,
        Timestamp: null
    };
}

/**
 * Build linked documents
 */
function buildLinkedDocuments(linksStr) {
    if (!linksStr) return null;
    return linksStr.split(',').filter(Boolean);
}

/**
 * Helper: Compare arrays
 */
function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((val, i) => val === sortedB[i]);
}
```

---

## 11. CRITICAL BUSINESS LOGIC

### 11.1 Document State Logic

```javascript
/**
 * CRITICAL: Document state cannot revert to PENDING
 */
if (extendedDocument.State !== null
    && extendedDocument.State !== 'PENDING'
    && nmdDocumentState === 'PENDING') {

    // Use existing state, not NMD state
    documentState = extendedDocument.State;
}
```

**Reason:** Once a document moves beyond PENDING state, it cannot go back.

---

### 11.2 Patch Comparison Logic

**⚠️ PRODUCTION LOGIC (from PatchBuilder.cs:39-169):**

```csharp
// Production only includes fields that have changed
private static T? ProcessPatchProperty<T>(T? nmdValue, T? extendedValue)
{
    if (nmdValue is null)
    {
        return default;  // Don't include nulls
    }

    // Only include if value has changed
    if (!EqualityComparer<T>.Default.Equals(nmdValue, extendedValue))
    {
        return nmdValue;
    }

    return default;  // Value unchanged, don't include in patch
}
```

**⚠️ POC SIMPLIFICATION:**

```javascript
// POC sends FULL document state (not just changed fields)
function buildPatchRequest(nmdMessage, existingDocument) {
    // POC includes ALL fields from NMD message
    return {
        DocumentId: docProps.id,  // Always included
        CabinetId: envProps.containingcabs[0],  // Always included
        Name: docProps.name,  // Always included (even if unchanged)
        State: calculateDocumentState(...),  // Always included
        // ... all other fields always included
    };
}

// Production logic would be:
function buildPatchRequest(nmdMessage, existingDocument) {
    return {
        DocumentId: docProps.id,  // Always required
        CabinetId: envProps.containingcabs[0],  // Always required
        Name: processPatchProperty(docProps.name, existingDocument?.Name),  // Only if changed
        State: processPatchProperty(calculateDocumentState(...), existingDocument?.State),
        // ... only include fields that have changed
    };
}

function processPatchProperty(nmdValue, extendedValue) {
    if (nmdValue === null || nmdValue === undefined) {
        return null;  // Don't include nulls
    }
    if (nmdValue !== extendedValue) {
        return nmdValue;  // Value changed, include it
    }
    return null;  // Value unchanged, don't include in patch
}
```

**Why This Matters:**
- **Production:** Smaller payload, more efficient, avoids unnecessary updates
- **POC:** Simpler logic, easier to debug, demonstrates full data structure
- **Impact:** POC patch requests are larger but functionally equivalent

---

### 11.3 Custom Attributes Delta Calculation

**⚠️ PRODUCTION LOGIC (from CustomAttributesBuilder.cs):**

Production calculates **add/update/delete deltas** to send only changes:

**Operations:**
- **Add**: Attribute in NMD but not in Extended → `{ Key, Values, IsDeleted: false }`
- **Update**: Attribute in both with different values → `{ Key, Values, IsDeleted: false }`
- **Delete**: Attribute in Extended but not in NMD → `{ Key, IsDeleted: true }`

```csharp
// Production: Calculate delta
var result = new List<PatchDocumentCustomAttribute>();

// Find added or updated attributes
foreach (var nmdAttr in nmdAttributes)
{
    var existingAttr = existingAttributes.Find(a => a.Key == nmdAttr.Key);
    if (existingAttr == null || !ValuesEqual(nmdAttr.Values, existingAttr.Values))
    {
        result.Add(new PatchDocumentCustomAttribute
        {
            Key = nmdAttr.Key,
            Values = nmdAttr.Values,
            IsDeleted = false
        });
    }
}

// Find deleted attributes
foreach (var existingAttr in existingAttributes)
{
    if (!nmdAttributes.Any(a => a.Key == existingAttr.Key))
    {
        result.Add(new PatchDocumentCustomAttribute
        {
            Key = existingAttr.Key,
            IsDeleted = true
        });
    }
}

return result.Count > 0 ? result : null;  // Only return if changes exist
```

**⚠️ POC SIMPLIFICATION:**

```javascript
// POC: Extract ALL attributes from NMD (no delta calculation)
function extractCustomAttributes(docProps) {
    var customAttrs = [];

    // Extract all properties starting with "cp|"
    for (var key in docProps) {
        if (key.startsWith('cp|')) {
            var parts = key.split('|');
            if (parts.length === 3) {
                customAttrs.push({
                    Key: parts[2],
                    Values: [String(docProps[key])],
                    IsDeleted: false
                });
            }
        }
    }

    return customAttrs;  // Always returns all attributes, not just changes
}
```

**Why This Matters:**
- **Production:** Only sends changes (more efficient, avoids unnecessary updates)
- **POC:** Sends all custom attributes every time (simpler, easier to understand)
- **Impact:** POC may send unchanged custom attributes, but functionally equivalent

---

### 11.4 First-Time Sync Detection

**⚠️ PRODUCTION LOGIC (from FirstTimeSyncingChecker.cs:71-189):**

```csharp
// Production checks for DocumentId, CabinetId, AND EnvUrl
private static bool HasBeenSyncedBefore(ExtendedDocument? extendedDocument)
{
    if (extendedDocument is null)
    {
        return false;
    }

    // CRITICAL: Document must have ALL three fields to be considered synced
    var hasDocumentId = !string.IsNullOrWhiteSpace(extendedDocument.DocumentId);
    var hasCabinetId = !string.IsNullOrWhiteSpace(extendedDocument.CabinetId);
    var hasEnvUrl = !string.IsNullOrWhiteSpace(extendedDocument.EnvUrl);

    return hasDocumentId && hasCabinetId && hasEnvUrl;
}
```

**⚠️ POC SIMPLIFICATION:**

```javascript
// POC uses simplified logic (404 check only)
const isNewDocument = !extendedDocument;  // Just checks if document exists

// Production logic would be:
function hasBeenSyncedBefore(doc) {
    if (!doc) return false;

    // Check if document has complete metadata (all 3 required)
    var hasDocumentId = doc.DocumentId && doc.DocumentId.trim().length > 0;
    var hasCabinetId = doc.CabinetId && doc.CabinetId.trim().length > 0;
    var hasEnvUrl = doc.EnvUrl && doc.EnvUrl.trim().length > 0;

    return hasDocumentId && hasCabinetId && hasEnvUrl;
}
```

**Why This Matters:**
- Production: A document can exist (200 OK) but still be "new" if missing DocumentId/CabinetId/EnvUrl
- POC: Any 200 response = existing document, 404 = new document
- This affects discovery workflow (production runs discovery for incomplete documents)

---

## 12. API DEPENDENCIES & SEQUENCING

### Sequential Execution Required

```
Step 1: Check Document Existence
   ↓ (Sets: existingDocument, isNewDocument)

Step 2: Update Content Document Root
   ↓ (Configures content storage)

Step 3: Build Patch Request
   ↓ (Transforms NMD → PatchRequest)

Step 4: Patch Extended Document
   ↓ (Main synchronization)

IF isNewDocument === true:
   ├─→ Step 5A: Get Document Attachments
   ├─→ Step 5B: Get Version Attachments (per version)
   └─→ Step 5C: Get Snapshots (per version)
```

### Parallel Operations (within Discovery)

- Get attachments for different versions can run in parallel
- Get snapshots for different versions can run in parallel

---

## 13. TESTING STRATEGY

### Test Scenarios

#### Scenario 1: New Document Creation
**Input:** `sample_simple_document`
**Expected:**
- ✅ Step 1 returns 404
- ✅ isNewDocument = true
- ✅ Document created in Step 4
- ✅ Discovery workflow executes

#### Scenario 2: Document Update (Existing)
**Input:** `sample_simple_document` (modify documentId to existing)
**Expected:**
- ✅ Step 1 returns 200
- ✅ isNewDocument = false
- ✅ Document updated in Step 4
- ✅ Discovery workflow skipped

#### Scenario 3: Document with DLP Policies
**Input:** `sample_dlp_policy`
**Expected:**
- ✅ RepositoryId extracted
- ✅ PolicyId extracted
- ✅ Patch request includes DLP info

#### Scenario 4: Document with Custom Attributes
**Input:** `sample_custom_attributes`
**Expected:**
- ✅ Custom attributes extracted from `cp|` properties
- ✅ Delta calculation correct (add/update/delete)
- ✅ Patch request includes custom attributes

#### Scenario 5: Document in Folder Tree
**Input:** `sample_folder_tree`
**Expected:**
- ✅ FolderTree array populated
- ✅ ParentFolders array populated
- ✅ Patch request includes folder hierarchy

#### Scenario 6: Document with Multiple Versions
**Input:** `sample_multiple_versions`
**Expected:**
- ✅ All 3 versions parsed
- ✅ Version parent relationships preserved
- ✅ OfficialVersion set correctly

---

### Validation Points

**For Each Request:**
- ✅ Response status code (200, 201, 404, etc.)
- ✅ Response body structure
- ✅ Changed fields correctly identified
- ✅ No unnecessary API calls

**For Patch Request:**
- ✅ Only changed fields included (production) / All fields included (POC)
- ✅ Date formats converted correctly
- ✅ ACL structure correct
- ✅ DLP info present when applicable
- ✅ Custom attributes delta correct (production) / All attributes included (POC)

---

### POC Validation Approach

**⚠️ POC IMPLEMENTATION:** The POC includes a dedicated **"04 - Validation"** folder with comprehensive data integrity checks:

#### Validation Request 1: Document Metadata
- **Checks:** Document exists (200 OK), ID matches, state is ACTIVE, cabinet ID set, name updated, EnvUrl set
- **Purpose:** Verify core document metadata was created/updated correctly

#### Validation Request 2: Versions
- **Checks:** Document has versions, version 1 exists, extension/label/state correct, timestamps present
- **Purpose:** Verify version metadata structure and integrity

#### Validation Request 3: ACL
- **Checks:** ACL entries exist (2), group entry (UG-LGSFSO0I), user entry (DUCOT-pbs.nonadmin), VESD relations correct
- **Purpose:** Verify ACL transformation from NetDocuments format to SpiceDB relations

#### Validation Request 4: ModNums
- **Checks:** ModNums present, DocModNum incremented in Scenario 2, timestamps updated
- **Purpose:** Verify modification tracking and increment logic

#### Validation Request 5: Summary
- **Purpose:** Print comprehensive final state summary to console
- **Output:** Complete document structure for manual verification

**Example Test Assertion:**
```javascript
pm.test('Document name was updated in Scenario 2', function () {
    var doc = pm.response.json();
    pm.expect(doc.name).to.include('[UPDATED]');
});

pm.test('ACL has correct relations (VESD)', function () {
    var doc = pm.response.json();
    var aclEntry = doc.acl.find(e => e.subjectId === 'UG-LGSFSO0I');
    pm.expect(aclEntry.relations).to.include.members(['viewer', 'editor', 'sharer', 'administrator']);
});
```

**Validation Benefits:**
- ✅ Confirms both scenarios (CREATE and UPDATE) work end-to-end
- ✅ Verifies data integrity after synchronization
- ✅ Validates transformation logic (dates, ACL, ModNums)
- ✅ Provides clear pass/fail results for each aspect
- ✅ Newman-compatible for CI/CD integration

---

## 14. IMPLEMENTATION PHASES

### Phase 1: Environment Setup (1 hour)

**Tasks:**
- [ ] Create Postman environment: "doc-ndserver-sync-wrk - [QA]"
- [ ] Add all environment variables (base URLs, tokens, working vars)
- [ ] Obtain S2S tokens using CLI
- [ ] Set tokens in environment
- [ ] Load sample messages into environment variables

**Deliverables:**
- ✅ Environment file exported and saved
- ✅ Tokens validated (test with simple GET request)

---

### Phase 2: Collection Structure (1 hour)

**Tasks:**
- [ ] Create collection: "doc-ndserver-sync-wrk"
- [ ] Create folder structure (00-06)
- [ ] Add README requests with documentation
- [ ] Add sample loading requests (folder 01)

**Deliverables:**
- ✅ Collection structure complete
- ✅ Documentation accessible within Postman

---

### Phase 3: Core Transformation Scripts (4-5 hours)

**Tasks:**
- [ ] Implement date conversion helper
- [ ] Implement document state calculator
- [ ] Implement ACL builder
- [ ] Implement DLP builder
- [ ] Implement custom attributes extractor
- [ ] Implement version builder
- [ ] Implement patch comparison logic
- [ ] Implement complete NMD → Patch transformer
- [ ] Test each script independently

**Deliverables:**
- ✅ All transformation scripts in folder 04
- ✅ Scripts tested with sample data
- ✅ Console output validated

---

### Phase 4: API Request Implementation (3 hours)

**Tasks:**
- [ ] Implement Step 1: Check Document Existence
- [ ] Implement Step 2: Update Content Document Root
- [ ] Implement Step 3: Build Patch Request
- [ ] Implement Step 4: Patch Extended Document
- [ ] Implement Discovery workflow requests
- [ ] Add pre-request scripts
- [ ] Add test scripts

**Deliverables:**
- ✅ All API requests functional
- ✅ Tests passing for happy path

---

### Phase 5: Testing & Validation (2-3 hours)

**Tasks:**
- [ ] Test with `sample_simple_document`
- [ ] Test with `sample_dlp_policy`
- [ ] Test with `sample_custom_attributes`
- [ ] Test with `sample_folder_tree`
- [ ] Test with `sample_multiple_versions`
- [ ] Test error scenarios (404, 400, etc.)
- [ ] Validate transformation logic
- [ ] Document any issues or limitations

**Deliverables:**
- ✅ Test results documented
- ✅ Issues logged
- ✅ Collection validated end-to-end

---

### Phase 6: Documentation & Handoff (1 hour)

**Tasks:**
- [ ] Create usage guide
- [ ] Document known limitations
- [ ] Export collection and environment
- [ ] Create quick-start guide
- [ ] Record demo video (optional)

**Deliverables:**
- ✅ Complete documentation
- ✅ Collection and environment files
- ✅ Usage guide

---

### Total Estimated Effort: 12-14 hours

---

## APPENDIX A: SAMPLE MESSAGE FILES

The following sample message JSON files have been extracted and saved:

1. `sample_simple_document.json` - Document 4817-7713-8883
2. `sample_dlp_policy.json` - Document 4816-0936-6723 (with DLP)
3. `sample_custom_attributes.json` - Document 4816-0936-6723 (with custom attrs)
4. `sample_folder_tree.json` - Document 4816-5969-8371 (with folder hierarchy)
5. `sample_multiple_versions.json` - Document 4835-7223-5459 (3 versions)

---

## APPENDIX B: POSTMAN QUICK START

### Quick Start Guide

**Step 1: Import Collection & Environment**
```
1. Open Postman
2. Import collection: doc-ndserver-sync-wrk.postman_collection.json
3. Import environment: doc-ndserver-sync-wrk-QA.postman_environment.json
```

**Step 2: Obtain Tokens**
```bash
# Get metadata token
./get-metadata-token.sh

# Get content token
./get-content-token.sh

# Get ACL token
./get-acl-token.sh
```

**Step 3: Set Tokens in Environment**
```
1. Select environment: "doc-ndserver-sync-wrk - [QA]"
2. Paste tokens into metadataToken, contentToken, aclToken
3. Save environment
```

**Step 4: Load Sample Message**
```
1. Open folder: 01-Sample-NMD-Messages
2. Run: "Load Sample: Simple Document"
3. Verify nmdMessage variable is set
```

**Step 5: Run Sync Workflow**
```
1. Open folder: 02-Full-Sync-Workflow
2. Click "Run folder" (or run requests sequentially)
3. Watch console output
4. Verify success in tests tab
```

---

## APPENDIX C: TROUBLESHOOTING

### Common Issues

**Issue:** Token expired (401 Unauthorized)
**Solution:** Re-run token generation commands, update environment

**Issue:** Document not found (404)
**Solution:** Verify documentId is correct, check if document exists in metadata API

**Issue:** Transformation script errors
**Solution:** Check console for errors, verify nmdMessage format

**Issue:** Patch request too large
**Solution:** Verify only changed fields are included (not nulls)

---

## CONCLUSION

This plan provides a comprehensive blueprint for implementing the `doc-ndserver-sync-wrk` functionality as a Postman collection. The collection will enable:

✅ **Manual testing** of the synchronization workflow
✅ **API validation** and debugging
✅ **Understanding** of the worker's behavior
✅ **Training** for new developers

The collection replicates the core synchronization logic while leveraging Postman's capabilities for environment management, scripting, and testing.

---

**END OF DOCUMENT**
