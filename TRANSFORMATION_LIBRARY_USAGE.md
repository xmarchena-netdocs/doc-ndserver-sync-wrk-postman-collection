# Transformation Library Usage Guide

## Overview

This project provides **two transformation libraries** for converting NetDocuments NMD messages to metadata service API requests:

- **REST API v1 (`transformation-library.js`)** - Legacy PascalCase format
- **REST API v3 (`v3_transformation_library.js`)** - Modern camelCase format with additional v1→v3 conversion functions

Both libraries implement centralized transformation logic at the collection level to eliminate code duplication and ensure consistency across all scenarios.

---

## 🔄 REST API v1 vs v3 Architecture

### Library Organization

Both libraries share the **same core transformation functions** for parsing NMD messages. The v3 library extends v1 with additional conversion layers:

```
┌─────────────────────────────────────────┐
│  transformation-library.js (v1)         │
│  ────────────────────────────────────── │
│  Core NMD Parsing Functions:            │
│  • buildPatchRequest()                   │
│  • buildAcl()                            │
│  • buildVersions()                       │
│  • extractCustomAttributes()             │
│  • determineDocumentState()              │
│  • etc.                                  │
│                                          │
│  Output: PascalCase v1 API format       │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  v3_transformation_library.js (v3)      │
│  ────────────────────────────────────── │
│  LAYER 1: Same core functions as v1     │
│  • buildPatchRequest() [IDENTICAL]       │
│  • buildAcl() [IDENTICAL]                │
│  • buildVersions() [IDENTICAL]           │
│  • etc.                                  │
│                                          │
│  LAYER 2: v1→v3 Conversion Pipeline     │
│  • convertToCamelCase()                  │
│  • transformToV3Structure()              │
│  • convertEmptyStringsToNull()           │
│  • applyV3Transformations()              │
│                                          │
│  Output: camelCase v3 API format        │
└─────────────────────────────────────────┘
```

### Key Architectural Differences

| Aspect | REST API v1 | REST API v3 |
|--------|-------------|-------------|
| **Core Functions** | Lines 1-621 | Lines 1-621 (identical) |
| **Conversion Layer** | None | Lines 632-884 (v1→v3 pipeline) |
| **Main Entry Point** | `buildAndSavePatchRequest()` outputs v1 | `buildAndSavePatchRequest()` outputs v3 |
| **Transformation Flow** | NMD → v1 format | NMD → v1 format → v3 format |
| **Code Size** | 736 lines | 1007 lines (+37% for conversion) |

---

## What Was Implemented

### ✅ Core NMD Transformation Functions (Both v1 & v3)

Both libraries provide comprehensive NMD message parsing (736 lines of shared code):

1. **Date Conversion** (Lines 15-46)
   - `/Date(milliseconds)/` → ISO 8601 format
   - ModNum (long format) → ISO 8601 conversion

2. **ACL Transformation** (Lines 48-131)
   - Rights mapping: `VESD` → `["viewer", "editor", "sharer", "administrator"]`
   - Subject type detection: `UG-` → group, `NG-`/`CA-` → cabinet, `DUCOT-` → user
   - Version-level ACL parsing (official_access_only)

3. **Version Building** (Lines 133-172)
   - Complete version transformation with dates, state, timestamps
   - Legacy signatures support

4. **Status Flags Processing** (Lines 174-288)
   - Bitwise flag extraction: archived, checked out, locked, autoversion
   - CheckedOut object building with user, timestamp, comment
   - Locked object building with lockDocumentModel parsing

5. **Custom Attributes** (Lines 290-344)
   - Dynamic property extraction from docProps
   - `cp|AttributeId|FieldNum` format parsing
   - IsDeleted flag support (v1 only)

6. **Linked Documents** (Lines 346-358)
   - Comma-separated links parsing

7. **Folder Hierarchy** (Lines 360-404)
   - Parent folders (space-separated)
   - Folder tree (pipe-separated)

8. **DLP and Classification** (Lines 406-430)
   - Classification ID extraction
   - Policy ID extraction

9. **Email Metadata** (Lines 432-471)
   - XML parsing for email properties
   - From, To, Cc, Subject, SentDate extraction

10. **Deleted Cabinets** (Lines 473-484)
    - Deleted cabinet array handling

11. **EnvUrl Extraction** (Lines 486-499)
    - Full URL → S3 key path conversion

12. **Document State Logic** (Lines 501-545)
    - PENDING, ACTIVE, DELETED, PURGE state determination
    - Matches C# NmdDocumentStateConverter logic

13. **Main Transformation** (Lines 547-621)
    - `buildPatchRequest()` - Assembles complete PATCH request
    - `buildAndSavePatchRequest()` - Helper that saves to environment

### ✅ v3 Conversion Layer (v3 Only)

The v3 library adds specialized conversion functions (Lines 632-884):

1. **Case Conversion** (`convertToCamelCase()` - Lines 639-658)
   - PascalCase → camelCase recursively
   - `DocumentId` → `documentId`
   - `Created` → `created`

2. **Structure Transformation** (`transformToV3Structure()` - Lines 660-752)
   - Flattens audit fields: `Created { UserId, Timestamp }` → `createdBy`, `createdAt`
   - Renames nested fields:
     - `CheckedOut { UserId }` → `checkedOut { checkedOutBy }`
     - `Locked { UserId }` → `locked { lockedBy }`
   - Version field mapping: `Size` → `contentSize`, adds `fileName` and `eTag`

3. **Null Cleanup** (`convertEmptyStringsToNull()` - Lines 754-805)
   - Converts empty strings to null for nullable fields (`policyId`, `classificationId`, `eTag`)
   - Removes unsupported fields (`isDeleted` from custom attributes)

4. **v3 API Validation Fixes** (`applyV3Transformations()` - Lines 807-884)
   - Adds leading slash to EnvUrl: `Ducot3/1/1/2/9/~file.nev` → `/Ducot3/1/1/2/9/~file.nev`
   - Cabinet fallback for DELETED documents
   - Custom attribute consolidation (merges duplicate `cp|` entries)
   - Timestamp ordering validation: enforces `modifiedAt >= createdAt`
   - eTag handling for optimistic locking

---

## File Structure

```
doc-ndserver-sync-wrk-postman-collection/
│
├── REST API v1 (Legacy)
│   ├── doc-ndserver-sync-wrk-POC.postman_collection.json      # v1 collection
│   ├── doc-ndserver-sync-wrk-POC.postman_environment.json     # v1 environment
│   └── transformation-library.js                               # v1 transformation source (736 lines)
│
├── REST API v3 (Modern)
│   ├── doc-ndserver-sync-wrk-POC-v3.postman_collection.json  # v3 collection
│   ├── doc-ndserver-sync-wrk-POC-v3.postman_environment.json # v3 environment
│   └── v3_transformation_library.js                           # v3 transformation source (1007 lines)
│
└── Documentation
    ├── TRANSFORMATION_LIBRARY_USAGE.md                         # This file
    └── NMD_TRANSFORMATION_ANALYSIS.md                          # Detailed analysis
```

---

## How to Use the Transformation Libraries

### Choose Your API Version

**For REST API v1 (Legacy):**

1. Open Postman
2. Click **Import**
3. Select `doc-ndserver-sync-wrk-POC.postman_collection.json`
4. Import `doc-ndserver-sync-wrk-POC.postman_environment.json`
5. Select the environment in Postman

**For REST API v3 (Modern):**

1. Open Postman
2. Click **Import**
3. Select `doc-ndserver-sync-wrk-POC-v3.postman_collection.json`
4. Import `doc-ndserver-sync-wrk-POC-v3.postman_environment.json`
5. Select the environment in Postman

### 2. Obtain Tokens

Run the following commands to get access tokens:

```bash
# Metadata Service Token
/home/xmarchena/code/idp-docker-utils/service-to-service-cli/service-to-service-cli auth get-access-token --audience doc-metadata-api-svc --scope "service.create service.read service.update service.delete"

# Content Service Token
/home/xmarchena/code/idp-docker-utils/service-to-service-cli/service-to-service-cli auth get-access-token --audience doc-content-api-svc --scope "service.create service.read service.update service.delete"
```

Paste the tokens into the environment variables:
- `metadataToken`
- `contentToken`

### 3. Run the Scenarios

The transformation library is automatically available to all requests in the collection. **Both v1 and v3 collections use identical pre-request scripts** - the only difference is the output format.

#### Scenario 1: New Document Creation (CREATE)

**Works identically in both v1 and v3 collections:**

```
01 - Load Sample Document
  └─ Load Sample: Simple Document

01a - Upload Initial Content
  ├─ Extract Content Metadata from NMD
  ├─ Create Snapshot & Get Presigned URL
  ├─ Upload Content to S3
  └─ Verify Snapshot Exists

02 - SCENARIO 1: New Document Creation
  ├─ S1 - Step 1: Check Document Existence (Expect 404)
  ├─ S1 - Step 2: Configure Content Root
  ├─ S1 - Step 3: Build CREATE Patch Request  ← Uses buildAndSavePatchRequest('CREATE')
  └─ S1 - Step 4: CREATE Document
```

#### Scenario 2: Document Update (UPDATE)

```
03 - SCENARIO 2: Document Update
  ├─ S2 - Step 1: Check Document Existence (Expect 200)
  ├─ S2 - Step 2: Update Content Root
  ├─ S2 - Step 3: Build UPDATE Patch Request  ← Uses buildAndSavePatchRequest('UPDATE')
  └─ S2 - Step 4: UPDATE Document
```

### 4. Check Console Output

**Both v1 and v3 libraries provide identical logging:**

```
✅ CREATE patch request built successfully
   Document: 79 REST v2 - File to Folder - Destination Fi Org
   Versions: 1
   ACL Entries: 2
   Custom Attributes: 0
   Linked Documents: 0
   Parent Folders: 0
   Folder Tree: 0
```

If advanced features are detected:

```
   Status: ARCHIVED
   Status: CHECKED OUT by DUCOT-user123
   Status: LOCKED by DUCOT-admin
   Classification: RL-CONFIDENTIAL
   DLP Policy: AC-DLPPOLICY1
```

### 5. Compare Output Formats

**v1 output (PascalCase):**
```json
{
  "DocumentId": "251023154100603",
  "Name": "Sample Document",
  "Created": {
    "UserId": "DUCOT-user123",
    "Timestamp": "2024-09-09T07:33:10.170Z"
  },
  "CheckedOut": {
    "UserId": null,
    "Timestamp": null,
    "Comment": null
  },
  "Versions": [{
    "VersionId": 1,
    "Size": 12345
  }],
  "CustomAttributes": [{
    "Key": "CA-7MZORBLU",
    "Values": ["value1"],
    "IsDeleted": false
  }]
}
```

**v3 output (camelCase):**
```json
{
  "documentId": "251023154100603",
  "name": "Sample Document",
  "createdBy": "DUCOT-user123",
  "createdAt": "2024-09-09T07:33:10.170Z",
  "checkedOut": {
    "checkedOutBy": null,
    "checkedOutAt": null,
    "comment": null
  },
  "versions": [{
    "versionId": 1,
    "contentSize": 12345,
    "fileName": "document.txt",
    "eTag": ""
  }],
  "customAttributes": [{
    "key": "CA-7MZORBLU",
    "values": ["value1"]
  }]
}
```

---

## Available Functions

### Main Function (Same in Both v1 and v3)

```javascript
buildAndSavePatchRequest(operationType)
```
- **Parameters**: `'CREATE'` or `'UPDATE'`
- **Description**: Builds complete PATCH request and saves to environment variable `patchRequest`
- **v1 behavior**: Outputs PascalCase format
- **v3 behavior**: Outputs camelCase format with v3 API validations

### Advanced Usage

**For v1 collection:**
```javascript
// Get NMD message
const nmdMessage = JSON.parse(pm.environment.get('nmdMessage'));

// Build v1 patch request
const patchRequest = buildPatchRequest(nmdMessage, 'CREATE');

// Modify as needed (PascalCase)
patchRequest.Name = "Custom Name";

// Save to environment
pm.environment.set('patchRequest', JSON.stringify(patchRequest, null, 2));
```

**For v3 collection:**
```javascript
// Get NMD message
const nmdMessage = JSON.parse(pm.environment.get('nmdMessage'));

// Build v1 format first
const v1PatchRequest = buildPatchRequest(nmdMessage, 'CREATE');

// Apply v3 transformations
const v3PatchRequest = applyV3Transformations(v1PatchRequest);

// Modify as needed (camelCase)
v3PatchRequest.name = "Custom Name";

// Save to environment
pm.environment.set('patchRequest', JSON.stringify(v3PatchRequest, null, 2));
```

### Core Utility Functions (Available in Both v1 and v3)

```javascript
// Date conversion
convertDate("/Date(1725881590170)/")  // → "2024-09-09T07:33:10.170Z"

// ACL transformation
const acls = buildAcl(nmdMessage)  // → Array of ACL entries

// Version building
const versions = buildVersions(nmdMessage.documents['1'].versions)

// Status flags
const flags = extractStatusFlags(docProps.status)

// Custom attributes
const attrs = extractCustomAttributes(docProps)

// Document state
const state = determineDocumentState(nmdMessage)  // → "PENDING", "ACTIVE", "DELETED", or "PURGE"
```

### v3-Only Conversion Functions

```javascript
// Convert PascalCase to camelCase
const camelCase = convertToCamelCase(v1Object)

// Transform structure (flatten audit fields, rename nested properties)
const transformed = transformToV3Structure(camelCaseObject)

// Clean up empty strings and unsupported fields
const cleaned = convertEmptyStringsToNull(transformedObject)

// Apply all v3 transformations at once
const v3Format = applyV3Transformations(v1PatchRequest)
```

See `transformation-library.js` (v1) or `v3_transformation_library.js` (v3) for complete function documentation.

---

## Scenario Script Changes

**Note**: Script changes are **identical for both v1 and v3 collections**. The only difference is the output format produced by the library.

### Before (Scenario 1 - Step 3)

```javascript
// === MINIMAL TRANSFORMATION FOR POC ===
// This is a simplified version for new document creation only

const nmdMessage = JSON.parse(pm.environment.get('nmdMessage'));
const doc = nmdMessage.documents['1'];
const docProps = doc.docProps;
const envProps = nmdMessage.envProps;

// Helper: Convert NetDocuments date format
function convertDate(dateStr) {
    if (!dateStr) return null;
    const match = dateStr.match(/\d+/);
    if (!match) return null;
    return new Date(parseInt(match[0])).toISOString();
}

// Helper: Build ACL
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

        let subjectType = 'user';
        if (entry.guid.startsWith('UG-')) subjectType = 'group';
        if (entry.guid.startsWith('NG-') || entry.guid.startsWith('CA-')) subjectType = 'cabinet';

        return {
            SubjectType: subjectType,
            SubjectId: entry.guid,
            Relations: relations
        };
    });
}

// Helper: Build versions list
function buildVersions(versions) {
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
            Locked: false,
            DeliveryRevoked: false,
            Created: {
                UserId: props.creatorguid,
                Timestamp: convertDate(props.created)
            },
            Modified: {
                UserId: props.modifiedByGuid || props.creatorguid,
                Timestamp: convertDate(props.modified || props.created)
            },
            State: 'ACTIVE',
            CopiedFrom: null,
            LegacySignatures: null
        });
    }

    return versionsList;
}

// Build minimal patch request for NEW document
const patchRequest = {
    DocumentId: docProps.id,
    CabinetId: envProps.containingcabs[0],
    Name: docProps.name,
    State: 'ACTIVE',
    OfficialVersion: docProps.lastVerNo,
    NextVersion: docProps.lastVerNo + 1,
    EnvUrl: envProps.url,
    ParentFolders: [],
    FolderTree: [],
    AclFreeze: false,
    DocModNum: parseInt(envProps.docmodnum),
    NameModNum: parseInt(docProps.nameModNum),
    ContentModNum: parseInt(docProps.contentModNum),
    DocNum: docProps.docNum,
    Created: {
        UserId: envProps.authorguid,
        Timestamp: convertDate(envProps.created)
    },
    Modified: {
        UserId: envProps['modified by guid'],
        Timestamp: convertDate(envProps.modified)
    },
    CheckedOut: {
        UserId: null,
        Timestamp: null,
        Comment: null,
        CollaborationEdit: null,
        CollaborationEditType: null
    },
    Locked: {
        UserId: null,
        Comment: null,
        Timestamp: null
    },
    LinkedDocuments: [],
    CustomAttributes: [],
    Versions: buildVersions(doc.versions),
    Acl: buildAcl(envProps.acl),
    RepositoryId: '',
    PolicyId: '',
    ClassificationId: '',
    DeletedCabinets: [],
    Alerts: [],
    Approval: null
};

pm.environment.set('patchRequest', JSON.stringify(patchRequest, null, 2));

console.log('✅ CREATE patch request built');
console.log(`   Document: ${patchRequest.Name}`);
console.log(`   Versions: ${patchRequest.Versions.length}`);
console.log(`   ACL Entries: ${patchRequest.Acl.length}`);
```

**Lines of code: ~150**

### After (Scenario 1 - Step 3) - Same for Both v1 and v3

```javascript
// Use centralized transformation library
buildAndSavePatchRequest('CREATE');
```

**Lines of code: 2** ✅

### Reduction

- **Before**: 150+ lines of duplicated code per scenario
- **After**: 2 lines per scenario (same for v1 and v3)
- **Savings**: ~98% reduction in scenario script size
- **Benefits**:
  - Single source of truth for all transformations
  - Easy to maintain and update
  - Consistent behavior across all scenarios
  - All advanced features included by default
  - Switching between v1 and v3 only requires changing collection/environment files

---

## Testing the Collections

### 1. Verify Collection-Level Script

**For v1 collection:**
1. Open the collection in Postman
2. Click on the collection name
3. Go to **Pre-request Scripts** tab
4. You should see 736 lines of transformation library code

**For v3 collection:**
1. Open the collection in Postman
2. Click on the collection name
3. Go to **Pre-request Scripts** tab
4. You should see 1007 lines of transformation library code (736 core + 271 conversion)

### 2. Run a Simple Test

1. Run "01 - Load Sample Document"
2. Run "02 - SCENARIO 1: New Document Creation" → "S1 - Step 3: Build CREATE Patch Request"
3. Check the Postman Console (View → Show Postman Console)
4. You should see:

```
✅ CREATE patch request built successfully
   Document: 79 REST v2 - File to Folder - Destination Fi Org
   Versions: 1
   ACL Entries: 2
   Custom Attributes: 0
   Linked Documents: 0
   Parent Folders: 0
   Folder Tree: 0
```

5. Check the environment variable `patchRequest`
6. It should contain a complete, properly formatted PATCH request

### 3. Run Full POC

1. Run the entire collection using **Collection Runner**
2. All scenarios should pass
3. Check console output for detailed transformation logs

---

## Comparison with C# Application

Both transformation libraries now include **ALL** features from the C# application except Delta Patching:

| Feature | C# App | Postman Before | v1 Library | v3 Library |
|---------|--------|----------------|-----------|-----------|
| Date Conversion | ✅ | ✅ | ✅ | ✅ |
| ACL Rights Mapping | ✅ | ✅ | ✅ | ✅ |
| Subject Type Detection | ✅ | ✅ | ✅ | ✅ |
| Version Building | ✅ | ✅ | ✅ | ✅ |
| Version-Level ACL | ✅ | ❌ | ✅ | ✅ |
| Custom Attributes | ✅ | ❌ | ✅ | ✅ (consolidated) |
| Status Flags | ✅ | ❌ | ✅ | ✅ |
| Email Metadata | ✅ | ❌ | ✅ | ✅ |
| DLP/Classification | ✅ | ❌ | ✅ | ✅ |
| Linked Documents | ✅ | ❌ | ✅ | ✅ |
| Parent Folders | ✅ | ❌ | ✅ | ✅ |
| Folder Tree | ✅ | ❌ | ✅ | ✅ |
| Deleted Cabinets | ✅ | ❌ | ✅ | ✅ |
| EnvUrl Extraction | ✅ | ⚠️ | ✅ | ✅ (with `/` prefix) |
| PascalCase → camelCase | N/A | ❌ | ❌ | ✅ |
| Audit Field Flattening | N/A | ❌ | ❌ | ✅ |
| Timestamp Validation | ✅ | ❌ | ❌ | ✅ |
| Optimistic Locking (eTag) | ✅ | ❌ | ❌ | ✅ |
| Delta Patching | ✅ | ❌ | ❌ | ❌ (intentionally excluded) |

---

## Troubleshooting

### Functions Not Available

**Problem**: Error: `buildAndSavePatchRequest is not defined`

**Solution**:
1. Ensure you imported the correct collection file:
   - v1: 736 lines of pre-request script
   - v3: 1007 lines of pre-request script
2. Check that the collection has a pre-request script at collection level
3. Restart Postman if necessary

### Transformation Errors

**Problem**: Console shows errors during transformation

**Solution**:
1. Check that `nmdMessage` environment variable is set
2. Verify NMD message format is correct
3. Check console for detailed error messages

### Missing Features in Output

**Problem**: Custom attributes, linked documents, etc. not appearing in patch request

**Solution**:
- These features are only included if present in the NMD sample
- Check your NMD sample data in the environment variable `sample_simple_document`
- If the sample doesn't have these fields, the output won't include them (as expected)

### Wrong Output Format (PascalCase vs camelCase)

**Problem**: Expected camelCase but got PascalCase (or vice versa)

**Solution**:
- Check which collection you imported:
  - `doc-ndserver-sync-wrk-POC.postman_collection.json` = v1 (PascalCase)
  - `doc-ndserver-sync-wrk-POC-v3.postman_collection.json` = v3 (camelCase)
- Ensure the matching environment is selected:
  - `doc-ndserver-sync-wrk-POC.postman_environment.json` for v1
  - `doc-ndserver-sync-wrk-POC-v3.postman_environment.json` for v3

---

## Extending the Libraries

### Adding Core NMD Parsing Functions

To add new core transformation functions (shared by both v1 and v3):

1. Edit `transformation-library.js` (v1 source)
2. Add your function with proper JSDoc comments
3. Copy the same function to `v3_transformation_library.js` at the corresponding line
4. Update both collections if using an injection script
5. Re-import collections in Postman

### Adding v3-Only Conversion Functions

To add new v3-specific conversion logic:

1. Edit `v3_transformation_library.js` only
2. Add your conversion function in the "V3 API TRANSFORMATION FUNCTIONS" section (after line 632)
3. Update the `applyV3Transformations()` pipeline if needed
4. Re-import the v3 collection in Postman

---

## Files to Version Control

Recommended files to commit to Git:

```
✅ REST API v1
   ├── doc-ndserver-sync-wrk-POC.postman_collection.json
   ├── doc-ndserver-sync-wrk-POC.postman_environment.json
   └── transformation-library.js

✅ REST API v3
   ├── doc-ndserver-sync-wrk-POC-v3.postman_collection.json
   ├── doc-ndserver-sync-wrk-POC-v3.postman_environment.json
   └── v3_transformation_library.js

✅ Documentation
   ├── NMD_TRANSFORMATION_ANALYSIS.md
   ├── TRANSFORMATION_LIBRARY_USAGE.md
   └── README.md

❌ Backup files (local only)
   └── *.backup.json
```

---

## Summary

Both transformation libraries provide:

### Shared Features (v1 & v3)
1. ✅ **Centralized transformation logic** at collection level
2. ✅ **Zero code duplication** in scenario scripts (same 2-line scripts for both)
3. ✅ **Complete feature parity** with C# NMD parsing (except Delta Patching)
4. ✅ **Easy maintenance** - update once, apply everywhere
5. ✅ **Detailed logging** for debugging
6. ✅ **Production-quality transformations** with all edge cases handled

### v1-Specific Features
- ✅ **PascalCase output** matching legacy API format
- ✅ **Nested audit structures** (`Created { UserId, Timestamp }`)
- ✅ **Custom attribute IsDeleted** flag support
- ✅ **Direct NMD → v1 API** transformation

### v3-Specific Features
- ✅ **camelCase output** matching modern API conventions
- ✅ **Flattened audit fields** (`createdBy`, `createdAt`)
- ✅ **Stricter validations** (timestamp ordering, required fields)
- ✅ **Optimistic locking** with eTag support
- ✅ **Custom attribute consolidation** (merges duplicates)
- ✅ **NMD → v1 → v3 pipeline** for maximum reliability

### Architecture Benefits
- 🔄 **Shared core logic** - 736 lines maintained once, used in both libraries
- 🎯 **Single source of truth** - core NMD parsing identical in v1 and v3
- 🚀 **Easy API migration** - switch between v1 and v3 by changing collection only
- 📊 **Side-by-side testing** - compare v1 vs v3 outputs easily

Both collections are ready for comprehensive POC testing and accurately replicate the production `doc-ndserver-sync-wrk` behavior for their respective API versions.
