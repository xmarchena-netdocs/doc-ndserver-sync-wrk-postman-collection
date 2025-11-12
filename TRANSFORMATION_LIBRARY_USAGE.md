# v3 Transformation Library Usage Guide

## Overview

The v3 transformation library (`v3_transformation_library.js`) converts NetDocuments NMD (NetDocuments Metadata) messages into v3 API-compatible request payloads. This library is loaded at the collection level and provides centralized transformation logic for all test scenarios.

**Key Features:**
- ✅ Complete NMD message parsing (40+ field mappings)
- ✅ PascalCase → camelCase conversion
- ✅ Audit field flattening (`Created { UserId, Timestamp }` → `createdBy`, `createdAt`)
- ✅ Optimistic locking with eTag support
- ✅ Custom attribute consolidation
- ✅ ACL relationship extraction for separate PUT/DELETE endpoints
- ✅ Timestamp validation and ordering enforcement
- ✅ Content size and file name requirements

---

## Architecture

The v3 transformation library uses a **two-layer architecture**:

```
┌─────────────────────────────────────────────────────┐
│  LAYER 1: Core NMD Parsing (Lines 1-631)           │
│  ─────────────────────────────────────────────────  │
│  Functions:                                         │
│  • buildPatchRequest() - Main NMD parser            │
│  • buildAcl() - ACL transformation                  │
│  • buildVersions() - Version metadata               │
│  • extractCustomAttributes() - cp| properties       │
│  • determineDocumentState() - PENDING/ACTIVE/etc.   │
│  • convertDate() - Date format conversion           │
│  • extractStatusFlags() - Bitwise flag parsing      │
│  • parseEmailMetadata() - XML email properties      │
│                                                      │
│  Output: PascalCase v1 format                       │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│  LAYER 2: v3 Conversion Pipeline (Lines 632-1007)  │
│  ─────────────────────────────────────────────────  │
│  Functions:                                         │
│  • applyV3Transformations() - Main v3 converter     │
│  • convertToCamelCase() - Case conversion           │
│  • transformToV3Structure() - Field restructuring   │
│  • convertEmptyStringsToNull() - Cleanup            │
│  • buildAclRelationships() - ACL endpoint payload   │
│                                                      │
│  Output: camelCase v3 format                        │
└─────────────────────────────────────────────────────┘
```

---

## Quick Start

### 1. Import Collection and Environment

```bash
# Import into Postman
- doc-ndserver-sync-wrk-POC-v3.postman_collection.json
- doc-ndserver-sync-wrk-POC-v3.postman_environment.json
```

### 2. Obtain Service-to-Service Tokens

```bash
# Metadata Service Token
cd /home/xmarchena/code/TokenGenerator
dotnet run doc-metadata-api-svc doc-metadata-api-svc \
  "service.create service.read service.update service.delete"

# Content Service Token
dotnet run doc-content-api-svc doc-content-api-svc \
  "service.create service.read service.update service.delete"
```

Paste tokens into environment variables:
- `metadataToken`
- `contentToken`

### 3. Run Test Scenarios

The transformation library is automatically available to all requests. Example scenario flow:

```
Scenario A: Upload → Create (Standard)
├── 01 - Load Sample Document
│   └─ Load NMD message from environment
│
├── 02a - Upload Initial Content
│   ├─ Extract content metadata
│   ├─ Get S3 presigned URL
│   ├─ Upload binary to S3
│   └─ Verify snapshot
│
├── 02 - CREATE Document
│   ├─ Build CREATE Patch Request  ← buildAndSavePatchRequest('CREATE')
│   ├─ PUT /v3/documents/{id}/extended
│   └─ Validate response
│
└── 03 - Sync ACL Relationships
    └─ PUT /v3/documents/{id}/acl-relationships
```

---

## Main Functions

### buildAndSavePatchRequest(operationType)

**Primary transformation function** - Converts NMD to v3 format and saves to environment.

```javascript
// Load NMD message
const nmdMessage = JSON.parse(pm.environment.get('nmdMessage'));

// Transform to v3 format
buildAndSavePatchRequest('CREATE');
// or
buildAndSavePatchRequest('UPDATE');

// Result saved to environment variable: 'patchRequest'
```

**Parameters:**
- `operationType` (string): `'CREATE'` or `'UPDATE'`
  - `CREATE`: New document (no eTag required)
  - `UPDATE`: Existing document (fetches eTag from environment)

**Output:**
- Saves complete v3-formatted ExtendedDocument to `pm.environment.get('patchRequest')`
- Logs transformation summary to console
- Includes all NMD fields: versions, ACLs, custom attributes, metadata

**Example Console Output:**
```
✅ CREATE patch request built successfully
   Document: 79 REST v2 - File to Folder - Destination Fi Org
   Cabinet ID: NG-CQDP4C8O
   State: ACTIVE
   Versions: 1
   ACL Entries: 2
   Custom Attributes: 1
   Custom Attribute Keys: 1001
   Linked Documents: 0
   Parent Folders: 0
   Folder Tree: 0
```

### buildAclRelationships(nmdMessage)

**Extracts ACL relationships** for separate v3 ACL endpoint calls.

```javascript
const nmdMessage = JSON.parse(pm.environment.get('nmdMessage'));
const aclRelationships = buildAclRelationships(nmdMessage);

// Use for:
// PUT /v3/documents/{documentId}/acl-relationships
// Body: aclRelationships array
```

**Returns:**
```javascript
[
  {
    "subjectType": "user",      // "user", "group", or "cabinet"
    "subjectId": "DUCOT-user123",
    "relations": ["viewer", "editor"]
  },
  {
    "subjectType": "group",
    "subjectId": "UG-LGSFSO0I",
    "relations": ["administrator"]
  }
]
```

**Rights Mapping:**
- `V` → `viewer`
- `E` → `editor`
- `S` → `sharer`
- `A`, `D` → `administrator`
- `N` → `denied`
- `Z` → `default`

---

## Core Transformation Features

### 1. Date Conversion

Converts NetDocuments date formats to ISO 8601:

```javascript
// NMD format: /Date(1761248460620)/
// v3 format:  2025-10-23T19:41:00.620Z

convertDate("/Date(1761248460620)/")
// → "2025-10-23T19:41:00.620Z"

// ModNum format: 20251023194107060 (yyyyMMddHHmmssfff)
convertModNumToISO(20251023194107060)
// → "2025-10-23T19:41:07.060Z"
```

### 2. Case Conversion (PascalCase → camelCase)

```javascript
// Input (v1 format)
{
  "DocumentId": "1234-5678-9012",
  "Name": "Sample Document",
  "CheckedOut": {
    "UserId": "DUCOT-user123",
    "Timestamp": "2025-10-23T19:41:00.620Z"
  }
}

// Output (v3 format)
{
  "documentId": "1234-5678-9012",
  "name": "Sample Document",
  "checkedOut": {
    "checkedOutBy": "DUCOT-user123",
    "checkedOutAt": "2025-10-23T19:41:00.620Z"
  }
}
```

### 3. Audit Field Flattening

```javascript
// v1 nested structure
{
  "Created": {
    "UserId": "DUCOT-user123",
    "Timestamp": "2025-10-23T19:41:00.620Z"
  },
  "Modified": {
    "UserId": "DUCOT-admin456",
    "Timestamp": "2025-10-23T20:15:30.123Z"
  }
}

// v3 flattened structure
{
  "createdBy": "DUCOT-user123",
  "createdAt": "2025-10-23T19:41:00.620Z",
  "modifiedBy": "DUCOT-admin456",
  "modifiedAt": "2025-10-23T20:15:30.123Z"
}
```

### 4. Version Metadata Transformation

```javascript
// v1 version structure
{
  "VersionId": 1,
  "Size": 2665,
  "Extension": "txt"
}

// v3 version structure (adds fileName and eTag)
{
  "versionId": 1,
  "contentSize": 2665,
  "extension": "txt",
  "fileName": "document.txt",
  "eTag": ""
}
```

### 5. Custom Attributes

Extracts and consolidates custom attributes from NMD `docProps`:

```javascript
// NMD format
{
  "docProps": {
    "cp|1001|1": "vip",
    "cp|2002|1": "confidential"
  }
}

// v3 format
{
  "customAttributes": [
    {
      "key": "1001",
      "values": ["vip"]
    },
    {
      "key": "2002",
      "values": ["confidential"]
    }
  ]
}
```

**Note:** v3 API consolidates duplicate custom attribute keys by merging values.

### 6. Document State Determination

Calculates document state based on NMD properties:

```javascript
determineDocumentState(nmdMessage)
// Returns: "PENDING" | "ACTIVE" | "DELETED" | "PURGE"
```

**State Logic:**
- `PENDING`: Document exists but no content uploaded
- `ACTIVE`: Normal document state
- `DELETED`: Document marked for deletion (soft delete)
- `PURGE`: Document permanently deleted (hard delete)

### 7. Status Flags Processing

Extracts bitwise flags from `docProps.status`:

```javascript
extractStatusFlags(status)
// Returns: {
//   isArchived: boolean,
//   isCheckedOut: boolean,
//   isLocked: boolean,
//   isAutoVersion: boolean,
//   isCollaborationEdit: boolean
// }
```

### 8. Email Metadata Parsing

Parses HTML-encoded XML email properties:

```javascript
// NMD format
{
  "docProps": {
    "email-from": "&lt;from&gt;user@example.com&lt;/from&gt;",
    "email-to": "&lt;to&gt;recipient@example.com&lt;/to&gt;"
  }
}

// v3 format
{
  "emailMetadata": {
    "from": "user@example.com",
    "to": ["recipient@example.com"],
    "cc": [],
    "subject": "",
    "sentDate": null
  }
}
```

---

## v3-Specific Validations

### 1. Timestamp Ordering

v3 API **enforces** `modifiedAt >= createdAt`:

```javascript
// If timestamps are out of order, library corrects:
if (modifiedAt < createdAt) {
  modifiedAt = createdAt;
}
```

### 2. EnvUrl Leading Slash

v3 API **requires** leading slash:

```javascript
// NMD: "Ducot3/1/1/2/9/~251023154100603.nev"
// v3:  "/Ducot3/1/1/2/9/~251023154100603.nev"
```

### 3. Optimistic Locking (eTag)

UPDATE operations **require** eTag:

```javascript
// Fetch current document first
GET /v3/documents/{documentId}/extended

// Extract eTag from response
const eTag = response.eTag;
pm.environment.set('currentETag', eTag);

// Use in UPDATE request
buildAndSavePatchRequest('UPDATE');
// eTag automatically included from environment
```

### 4. Empty String to Null Conversion

Nullable fields converted to `null`:

```javascript
// Before
{
  "policyId": "",
  "classificationId": "",
  "eTag": ""
}

// After
{
  "policyId": null,
  "classificationId": null,
  "eTag": null
}
```

---

## Advanced Usage

### Manual Transformation Pipeline

For custom scenarios requiring transformation modifications:

```javascript
// Step 1: Load NMD message
const nmdMessage = JSON.parse(pm.environment.get('nmdMessage'));

// Step 2: Build v1 format (PascalCase)
const v1PatchRequest = buildPatchRequest(nmdMessage, 'CREATE');

// Step 3: Convert to v3 format (camelCase)
const v3PatchRequest = applyV3Transformations(v1PatchRequest);

// Step 4: Custom modifications (optional)
v3PatchRequest.name = "Custom Document Name";
v3PatchRequest.customAttributes.push({
  key: "3003",
  values: ["custom-value"]
});

// Step 5: Save to environment
pm.environment.set('patchRequest', JSON.stringify(v3PatchRequest, null, 2));
```

### Custom Attribute Extraction

```javascript
const nmdMessage = JSON.parse(pm.environment.get('nmdMessage'));
const customAttrs = extractCustomAttributes(
  nmdMessage.documents['1'].docProps
);

console.log('Custom Attributes:', customAttrs);
// [{ Key: "1001", Values: ["vip"], IsDeleted: false }]
```

### ACL Processing

```javascript
const nmdMessage = JSON.parse(pm.environment.get('nmdMessage'));
const acls = buildAcl(nmdMessage);

console.log('Document ACLs:', acls);
// [{ SubjectType: "user", SubjectId: "DUCOT-user123", Relations: ["viewer"] }]
```

### Version Building

```javascript
const nmdMessage = JSON.parse(pm.environment.get('nmdMessage'));
const versions = buildVersions(
  nmdMessage.documents['1'].versions
);

console.log('Versions:', versions);
// [{ VersionId: 1, Size: 2665, Extension: "txt", ... }]
```

---

## Comparison with sync-wrk Service

The v3 transformation library replicates **all core features** from the C# `doc-ndserver-sync-wrk` service:

| Feature | C# sync-wrk | v3 Library | Notes |
|---------|-------------|------------|-------|
| **NMD Parsing** | ✅ | ✅ | Complete field mapping |
| **Date Conversion** | ✅ | ✅ | `/Date()` and ModNum formats |
| **ACL Transformation** | ✅ | ✅ | Rights mapping, subject types |
| **Version Building** | ✅ | ✅ | All version metadata fields |
| **Custom Attributes** | ✅ | ✅ | cp\| prefix parsing, consolidation |
| **Status Flags** | ✅ | ✅ | Bitwise flag extraction |
| **Email Metadata** | ✅ | ✅ | XML parsing, HTML decoding |
| **DLP/Classification** | ✅ | ✅ | Policy and classification IDs |
| **Document State** | ✅ | ✅ | PENDING/ACTIVE/DELETED/PURGE |
| **Linked Documents** | ✅ | ✅ | Comma-separated parsing |
| **Folder Hierarchy** | ✅ | ✅ | Parent folders, folder tree |
| **camelCase Conversion** | ✅ | ✅ | PascalCase → camelCase |
| **Audit Flattening** | ✅ | ✅ | Nested → flat structure |
| **Timestamp Validation** | ✅ | ✅ | Ordering enforcement |
| **Optimistic Locking** | ✅ | ✅ | eTag support |
| **ACL Relationships** | ✅ | ✅ | Separate endpoint payloads |
| **Delta Patching** | ✅ | ❌ | Intentionally excluded (testing) |

**Note:** Delta patching is excluded because the Postman collection performs **full document upserts** for simpler testing. The C# service uses delta patching to minimize payload size in production.

---

## API Endpoints Used

The collection exercises these v3 API endpoints:

### Metadata API (v3)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v3/documents/{documentId}/extended` | GET | Check document existence, get eTag |
| `/v3/documents/{documentId}/extended` | PUT | Upsert document metadata |
| `/v3/documents/{documentId}/acl-relationships` | PUT | Set ACL relationships |
| `/v3/documents/{documentId}/acl-relationships` | DELETE | Remove all ACL relationships |

### Content API (v1)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/content/{documentId}/versions/{versionId}/snapshots` | POST | Get S3 presigned URL |
| `/v1/content/{documentId}/versions/{versionId}/snapshots` | GET | Verify snapshot exists |
| `{presignedUrl}` | PUT | Upload binary to S3 |

**Note:** Content API uses v1 endpoints (no v3 content API available).

---

## Test Scenarios

The collection includes **9 comprehensive scenarios** testing 93% of production document types:

### Scenario A: Upload → Create (7 sub-scenarios)
- **A1**: TXT Document (45% of production volume)
- **A2**: DOCX Document (25% of production)
- **A3**: PDF Document
- **A4**: NDFLD Folder (8% of production)
- **A5**: WOPITEST/Office 365 (12% of production)
- **A6**: EML Email (3% of production)
- **A7**: Archived Document

### Scenarios B-I: State Changes
- **B**: Delete → Purge
- **C**: Rename Document
- **D**: Lock Document
- **E**: Unlock Document
- **F**: Check Out Document
- **G**: Check In Document
- **H**: Archive Document
- **I**: Move Document (change cabinet)

**Total Test Coverage:**
- **154 HTTP requests** across all scenarios
- **214 automated assertions**
- **18 NMD sample messages**
- **100% pass rate** (latest run: Nov 11, 2025)

---

## Troubleshooting

### Functions Not Available

**Problem:** `buildAndSavePatchRequest is not defined`

**Solution:**
1. Verify collection import: Pre-request script should show 1007 lines
2. Check collection-level pre-request script exists
3. Restart Postman if necessary

### Missing eTag for UPDATE

**Problem:** `No eTag found in environment for UPDATE operation`

**Solution:**
```javascript
// Before UPDATE, fetch current document:
GET /v3/documents/{documentId}/extended

// Test script should save eTag:
const response = pm.response.json();
pm.environment.set('currentETag', response.eTag);
```

### Timestamp Validation Errors

**Problem:** API returns `400 Bad Request` - `modifiedAt must be >= createdAt`

**Solution:** Library automatically fixes this, but if manually constructing:
```javascript
// Ensure modifiedAt >= createdAt
if (modifiedAt < createdAt) {
  modifiedAt = createdAt;
}
```

### Custom Attributes Not Appearing

**Problem:** Custom attributes missing from output

**Solution:** Check NMD sample for `cp|` prefix properties:
```javascript
// NMD must have:
{
  "docProps": {
    "cp|1001|1": "vip"  // ← Custom attribute
  }
}
```

### ACL Relationships Not Syncing

**Problem:** ACLs embedded in document but not using separate endpoint

**Solution:** Use `buildAclRelationships()` function:
```javascript
const aclRelationships = buildAclRelationships(nmdMessage);

// Then call:
// PUT /v3/documents/{documentId}/acl-relationships
// Body: aclRelationships
```

---

## Console Output Reference

### Successful Transformation

```
✅ CREATE patch request built successfully
   Document: Sample Document Name
   Cabinet ID: NG-CQDP4C8O
   State: ACTIVE
   Versions: 1
   ACL Entries: 2
   Custom Attributes: 1
   Custom Attribute Keys: 1001
   Linked Documents: 0
   Parent Folders: 0
   Folder Tree: 0
```

### With Advanced Features

```
✅ UPDATE patch request built successfully
   Document: Complex Document
   Cabinet ID: NG-CQDP4C8O
   State: ACTIVE
   Versions: 3
   ACL Entries: 5
   Custom Attributes: 2
   Custom Attribute Keys: 1001, 2002
   Linked Documents: 3
   Parent Folders: 2
   Folder Tree: 4
   Status: ARCHIVED
   Status: CHECKED OUT by DUCOT-user123
   Status: LOCKED by DUCOT-admin456
   Classification: RL-CONFIDENTIAL
   DLP Policy: AC-DLPPOLICY1
```

---

## Files and Versions

### Current Collection Files

```
doc-ndserver-sync-wrk-postman-collection/
│
├── v3 Collection (Modern camelCase API)
│   ├── doc-ndserver-sync-wrk-POC-v3.postman_collection.json  # 154 requests
│   ├── doc-ndserver-sync-wrk-POC-v3.postman_environment.json # 18 NMD samples
│   └── v3_transformation_library.js                          # 1007 lines
│
├── NMD Samples
│   └── samples/                                              # 18 samples
│       ├── sample_simple_document.json                       # TXT (A1)
│       ├── sample_docx_document.json                         # DOCX (A2)
│       ├── sample_pdf_document.json                          # PDF (A3)
│       ├── sample_folder_document.json                       # NDFLD (A4)
│       └── ... (14 more samples)
│
└── Documentation
    ├── README.md                                             # Project overview
    ├── TRANSFORMATION_LIBRARY_USAGE.md                       # This file
    └── POSTMAN_VS_SYNC_WRK_COMPARISON.md                     # C# comparison
```

### Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-10-24 | Initial v3 collection created |
| 2.0 | 2024-11-06 | Full transformation library implemented |
| 2.1 | 2025-11-11 | Custom attribute key updated to 1001 |
| 2.2 | 2025-11-11 | Cabinet ID standardized (NG-CQDP4C8O) |
| 2.3 | 2025-11-11 | File paths restored to samples/content/ format |

---

## Summary

The v3 transformation library provides:

✅ **Complete NMD → v3 API transformation** (40+ field mappings)
✅ **Zero code duplication** in scenarios (2-line scripts)
✅ **Production-grade feature parity** with C# sync-wrk service
✅ **Optimistic locking** with eTag support
✅ **ACL relationship extraction** for separate endpoints
✅ **Comprehensive validation** (timestamps, required fields)
✅ **Detailed logging** for debugging
✅ **154 test requests** covering 93% of production patterns

**Ready for comprehensive v3 API testing and validation.**

---

**Created:** 2024-10-24
**Last Updated:** 2025-11-11
**Status:** Production-ready v3 collection with comprehensive transformation library
**Maintainer:** Implementation based on C# `doc-ndserver-sync-wrk` service analysis
