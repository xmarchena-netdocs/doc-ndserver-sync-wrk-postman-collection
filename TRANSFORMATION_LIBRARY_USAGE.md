# Transformation Library Usage Guide

## Overview

The Postman collection has been enhanced with a **centralized transformation library** that implements all NMD message transformations at the collection level. This eliminates code duplication and ensures consistency across all scenarios.

## What Was Implemented

### ✅ Collection-Level Pre-Request Script

A comprehensive JavaScript library (567 lines) has been added as a collection-level pre-request script, providing:

1. **Date Conversion**
   - `/Date(milliseconds)/` → ISO 8601 format
   - ModNum (long format) → ISO 8601 conversion

2. **ACL Transformation**
   - Rights mapping: `VESD` → `["viewer", "editor", "sharer", "administrator"]`
   - Subject type detection: `UG-` → group, `NG-`/`CA-` → cabinet, `DUCOT-` → user
   - Version-level ACL parsing (official_access_only)

3. **Version Building**
   - Complete version transformation with dates, state, timestamps
   - Legacy signatures support

4. **Status Flags Processing** ⭐ NEW
   - Bitwise flag extraction: archived, checked out, locked, autoversion
   - CheckedOut object building with user, timestamp, comment
   - Locked object building

5. **Custom Attributes** ⭐ NEW
   - Dynamic property extraction from docProps
   - IsDeleted flag support

6. **Linked Documents** ⭐ NEW
   - Comma-separated links parsing

7. **Folder Hierarchy** ⭐ NEW
   - Parent folders (space-separated)
   - Folder tree (pipe-separated)

8. **DLP and Classification** ⭐ NEW
   - Classification ID extraction
   - Policy ID extraction

9. **Email Metadata** ⭐ NEW
   - XML parsing for email properties
   - From, To, Cc, Subject, SentDate extraction

10. **Deleted Cabinets** ⭐ NEW
    - Deleted cabinet array handling

11. **EnvUrl Extraction**
    - Full URL → S3 key path conversion

## File Structure

```
doc-ndserver-sync-wrk-postman-collection/
├── doc-ndserver-sync-wrk-POC.postman_collection.json      # Updated collection
├── doc-ndserver-sync-wrk-POC.postman_collection.json.backup  # Original backup
├── doc-ndserver-sync-wrk-POC.postman_environment.json     # Environment file
├── transformation-library.js                               # Source library code
├── inject-transformation-library.py                        # Injection script
├── NMD_TRANSFORMATION_ANALYSIS.md                          # Detailed analysis
└── TRANSFORMATION_LIBRARY_USAGE.md                         # This file
```

## How to Use the Updated Collection

### 1. Import the Collection

1. Open Postman
2. Click **Import**
3. Select `doc-ndserver-sync-wrk-POC.postman_collection.json`
4. Import `doc-ndserver-sync-wrk-POC.postman_environment.json`
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

The transformation library is automatically available to all requests in the collection.

#### Scenario 1: New Document Creation (CREATE)

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

The transformation library provides detailed logging:

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

## Available Functions

All functions are automatically available to every request in the collection:

### Main Function

```javascript
buildAndSavePatchRequest(operationType)
```
- **Parameters**: `'CREATE'` or `'UPDATE'`
- **Description**: Builds complete PATCH request and saves to environment variable `patchRequest`

### Advanced Usage

For more control, you can call individual functions:

```javascript
// Get NMD message
const nmdMessage = JSON.parse(pm.environment.get('nmdMessage'));

// Build patch request with custom logic
const patchRequest = buildPatchRequest(nmdMessage, 'CREATE');

// Modify as needed
patchRequest.Name = "Custom Name";

// Save to environment
pm.environment.set('patchRequest', JSON.stringify(patchRequest, null, 2));
```

### Utility Functions

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

// And many more...
```

See `transformation-library.js` for complete function documentation.

## Scenario Script Changes

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

### After (Scenario 1 - Step 3)

```javascript
// Use centralized transformation library
buildAndSavePatchRequest('CREATE');
```

**Lines of code: 2** ✅

### Reduction

- **Before**: 150+ lines of duplicated code per scenario
- **After**: 2 lines per scenario
- **Savings**: ~98% reduction in scenario script size
- **Benefits**:
  - Single source of truth for all transformations
  - Easy to maintain and update
  - Consistent behavior across all scenarios
  - All advanced features included by default

## Testing the Updated Collection

### 1. Verify Collection-Level Script

1. Open the collection in Postman
2. Click on the collection name
3. Go to **Pre-request Scripts** tab
4. You should see 567 lines of transformation library code

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

## Comparison with C# Application

The Postman transformation library now includes **ALL** features from the C# application except Delta Patching:

| Feature | C# App | Postman Before | Postman After |
|---------|--------|----------------|---------------|
| Date Conversion | ✅ | ✅ | ✅ |
| ACL Rights Mapping | ✅ | ✅ | ✅ |
| Subject Type Detection | ✅ | ✅ | ✅ |
| Version Building | ✅ | ✅ | ✅ |
| Version-Level ACL | ✅ | ❌ | ✅ |
| Custom Attributes | ✅ | ❌ | ✅ |
| Status Flags | ✅ | ❌ | ✅ |
| Email Metadata | ✅ | ❌ | ✅ |
| DLP/Classification | ✅ | ❌ | ✅ |
| Linked Documents | ✅ | ❌ | ✅ |
| Parent Folders | ✅ | ❌ | ✅ |
| Folder Tree | ✅ | ❌ | ✅ |
| Deleted Cabinets | ✅ | ❌ | ✅ |
| EnvUrl Extraction | ✅ | ⚠️ | ✅ |
| Delta Patching | ✅ | ❌ | ❌ (intentionally excluded) |

## Troubleshooting

### Functions Not Available

**Problem**: Error: `buildAndSavePatchRequest is not defined`

**Solution**:
1. Ensure you imported the **updated** collection file
2. Check that the collection has a pre-request script (567 lines)
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

## Extending the Library

To add new transformation functions:

1. Edit `transformation-library.js`
2. Add your function with proper JSDoc comments
3. Run `python3 inject-transformation-library.py` to update the collection
4. Re-import the collection in Postman

## Files to Version Control

Recommended files to commit to Git:

```
✅ doc-ndserver-sync-wrk-POC.postman_collection.json
✅ doc-ndserver-sync-wrk-POC.postman_environment.json
✅ transformation-library.js
✅ inject-transformation-library.py
✅ NMD_TRANSFORMATION_ANALYSIS.md
✅ TRANSFORMATION_LIBRARY_USAGE.md
❌ doc-ndserver-sync-wrk-POC.postman_collection.json.backup (local backup only)
```

## Summary

The Postman collection now features:

1. ✅ **Centralized transformation logic** at collection level
2. ✅ **Zero code duplication** in scenario scripts
3. ✅ **Complete feature parity** with C# application (except Delta Patching)
4. ✅ **Easy maintenance** - update once, apply everywhere
5. ✅ **Detailed logging** for debugging
6. ✅ **Production-quality transformations** with all edge cases handled

The collection is now ready for comprehensive POC testing and accurately replicates the production `doc-ndserver-sync-wrk` behavior.
