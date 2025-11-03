# POC Quick Start Guide

## Overview

This POC demonstrates the **doc-ndserver-sync-wrk** synchronization workflow with **TWO complete scenarios** plus comprehensive validation:

- **Scenario 1:** New Document Creation (404 → CREATE)
- **Scenario 2:** Document Update (200 → UPDATE)
- **Validation:** Verify data integrity and correctness

**Key Feature:** Uses **dynamic document IDs** for repeatable testing without conflicts.

## What's Included

✅ **Environment File**: `doc-ndserver-sync-wrk-POC.postman_environment.json`
✅ **Collection File**: `doc-ndserver-sync-wrk-POC.postman_collection.json`
✅ **Sample Data**: Simple document with 1 version (embedded in environment)
✅ **5 Folders**: Setup, Load Sample, Upload Content, Scenario 1, Scenario 2, Validation

## Setup Instructions

### Step 1: Import into Postman

1. Open Postman
2. Click **Import** button
3. Drag and drop both files:
   - `doc-ndserver-sync-wrk-POC.postman_environment.json`
   - `doc-ndserver-sync-wrk-POC.postman_collection.json`
4. Select environment: **"doc-ndserver-sync-wrk - POC [QA]"**

### Step 2: Obtain S2S Tokens

Run these commands in your terminal:

```bash
# Navigate to TokenGenerator
cd /home/xmarchena/code/TokenGenerator

# Get Metadata Service Token
dotnet run doc-metadata-api-svc doc-metadata-api-svc "service.create service.read service.update service.delete"

# Copy the token output

# Get Content Service Token
dotnet run doc-content-api-svc doc-content-api-svc "service.create service.read service.update service.delete"

# Copy the token output
```

### Step 3: Set Tokens in Environment

1. In Postman, click the **Environment Quick Look** (eye icon)
2. Click **Edit** next to "doc-ndserver-sync-wrk - POC [QA]"
3. Paste tokens into these variables:
   - `metadataToken`: [paste metadata token]
   - `contentToken`: [paste content token]
4. Click **Save**

### Step 4: Run the POC

**Option A: Run with Newman CLI (Recommended)**

```bash
cd /home/xmarchena/code/doc-ndserver-sync-wrk-postman-collection

# Run the complete POC
./node_modules/.bin/newman run doc-ndserver-sync-wrk-POC.postman_collection.json \
  -e doc-ndserver-sync-wrk-POC.postman_environment.json
```

**Option B: Run in Postman GUI**

1. Open collection: **"doc-ndserver-sync-wrk - POC (Two Scenarios + Validation)"**
2. Right-click on the collection name
3. Select **"Run collection"**
4. Click **"Run doc-ndserver-sync-wrk - POC"**
5. Watch the results in real-time

**Option C: Run Manually (Step by Step)**

1. Navigate to: **"01 - Load Sample Document"**
2. Click **Send** on "Load Sample: Simple Document"
3. Navigate to: **"01a - Upload Initial Content"**
4. Run each request in order to upload document content to S3
5. Navigate to: **"02 - SCENARIO 1: New Document Creation"**
6. Run each request in order (or right-click folder → Run folder)
7. Navigate to: **"03 - SCENARIO 2: Document Update"**
8. Run each request in order
9. Navigate to: **"04 - Validation"**
10. Run each validation request to verify data integrity

## Expected Results

### Load Sample Document
```
Status: 200 OK
Console: "🎬 LOADED SAMPLE FOR TWO SCENARIOS"
         "   NEW Dynamic ID: XXXX-XXXX-XXXX" (randomly generated)
         "   Cabinet ID: NG-8RZI6EOH"
```

### Upload Initial Content

**Step 1: Extract Content Metadata**
```
Status: 200 OK (dummy request)
Console: "📄 CONTENT METADATA EXTRACTION"
         "📝 Filename: 79 REST v2 - File to Folder - Destination Fi Org.txt"
         "🔤 Extension: txt"
         "👤 User ID: DUCOT-pbs.nonadmin"
```

**Step 2: Create Snapshot & Get Presigned URL**
```
Status: 201 Created
Console: "✅ Snapshot created:"
         "   📦 Object Key: XXXX-XXXX-XXXX/versions/1/SNAPSHOT/DEFAULT"
         "   🔗 Presigned URL: https://851725286390-us-west-2-doc-content-storage..."
```

**Step 3: Upload Content to S3**
```
Status: 200 OK
Console: "✅ Content uploaded successfully to S3"
         "   📦 Document now has both metadata AND content"
```

**Step 4: Verify Snapshot Exists**
```
Status: 200 OK
Console: "✅ Snapshot verified:"
         "   📋 Entity ID: [generated after upload]"
         "   🔤 Extension: txt"
         "   📦 Size: 300 bytes"
         "   ✔️  Content upload complete!"
```

### Scenario 1: New Document Creation

**Step 1: Check Document Existence**
```
Status: 404 Not Found
Console: "✅ EXPECTED: Document not found (404)"
         "   Ready to CREATE new document"
```

**Step 2: Configure Content Root**
```
Status: 204 No Content
Console: "✅ Content root configured for new document"
```

**Step 3: Build CREATE Patch Request**
```
Status: 200 OK (dummy request)
Console: "✅ CREATE patch request built"
         "   Document: 79 REST v2 - File to Folder - Destination Fi Org"
         "   Versions: 1"
         "   ACL Entries: 2"
```

**Step 4: CREATE Document**
```
Status: 200 OK
Console: "✅ SCENARIO 1 COMPLETE: Document CREATED"
         "➡️  Document ready for Scenario 2 (UPDATE)"
```

### Scenario 2: Document Update

**Step 1: Check Document Existence**
```
Status: 200 OK
Console: "✅ EXPECTED: Document found (200 OK)"
         "   Document State: ACTIVE"
         "   Current Versions: 1"
         "   Ready to UPDATE existing document"
```

**Step 2: Update Content Root**
```
Status: 204 No Content
Console: "✅ Content root updated"
```

**Step 3: Build UPDATE Patch Request**
```
Status: 200 OK (dummy request)
Console: "✅ UPDATE patch request built"
         "   CHANGE: Name updated to: ...  [UPDATED]"
         "   CHANGE: Modified timestamp: <current-time>"
         "   CHANGE: DocModNum incremented"
```

**Step 4: UPDATE Document**
```
Status: 200 OK
Console: "✅ SCENARIO 2 COMPLETE: Document UPDATED"
         "🎉 BOTH SCENARIOS COMPLETE!"
```

### Validation

**Validate Document Metadata**
```
Status: 200 OK
Tests: ✅ Document exists
       ✅ Document ID matches
       ✅ Document state is ACTIVE
       ✅ Cabinet ID is set
       ✅ Document name was updated in Scenario 2
       ✅ EnvUrl is set
```

**Validate Versions**
```
Status: 200 OK
Tests: ✅ Document has versions
       ✅ Version 1 exists
       ✅ Version has extension (txt)
       ✅ Version has label (1.0)
       ✅ Version state is ACTIVE
       ✅ Version has created timestamp
```

**Validate ACL**
```
Status: 200 OK
Tests: ✅ Document has ACL entries
       ✅ ACL has expected entries (2)
       ✅ Group ACL entry exists (UG-LGSFSO0I)
       ✅ User ACL entry exists (DUCOT-pbs.nonadmin)
       ✅ ACL has correct relations (VESD → viewer, editor, sharer, administrator)
```

**Validate ModNums**
```
Status: 200 OK
Tests: ✅ Document has ModNums
       ✅ DocModNum was incremented in Scenario 2
       ✅ Document has modified timestamp
       ✅ Document has created timestamp
```

**Validation Summary**
```
Status: 200 OK
Console: "🎉 ALL VALIDATIONS COMPLETE!"
         "✅ Scenario 1 (CREATE): Verified"
         "✅ Scenario 2 (UPDATE): Verified"
         "✅ Data Integrity: Confirmed"
         "✅ POC VALIDATION SUCCESSFUL!"
```

## Verification

After running the POC, you can manually verify the document exists:

```bash
# Get the document ID from the console output (e.g., XXXX-XXXX-XXXX)
# Then query the metadata API:

curl -H "Authorization: Bearer <metadataToken>" \
  http://doc-metadata-api-svc.lb.service/v1/documents/extended/<documentId>
```

Should return 200 with complete document metadata including:
- Document state: ACTIVE
- Name with [UPDATED] suffix
- 1 version (v1, label 1.0, extension txt)
- 2 ACL entries (group + user with VESD relations)
- EnvUrl, CabinetId, and timestamps

## Testing Different Document Types

**User Story 2 - NEW:** The POC now includes 7 document type samples covering 93% of production:

### Available Document Types

1. **Simple Document (txt)** - 45% of production
   - Baseline POC sample
   - Run: Original POC workflow or `05 - Test Scenario: DOCX Document` (for comparison)

2. **DOCX Document** - 25% of production
   - Microsoft Word documents
   - Run: `05 - Test Scenario: DOCX Document`

3. **PDF Document** - <1% of production
   - Read-only PDF files
   - Run: `06 - Test Scenario: PDF Document`

4. **Folder Container (.ndfld)** - 8% of production
   - Folder representations
   - Run: `07 - Test Scenario: Folder Document`
   - Note: This is a folder container, not a file

5. **WOPI Test File** - 12% of production (QA)
   - Office 365 integration test files
   - Run: `08 - Test Scenario: WOPI Test File`
   - Note: Used for cloud collaboration testing

6. **Email Message (.eml)** - 3% of production
   - Email documents with metadata
   - Run: `09 - Test Scenario: Email Document`
   - Note: Includes emailProps field

7. **Archived Document** - 3% of production
   - Documents with status=1 (Archived flag)
   - Run: `10 - Test Scenario: Archived Document`
   - Note: Tests status flag handling

### Running Test Scenarios

**Option A: Run individual scenario in Postman**

1. Navigate to scenario folder (e.g., `05 - Test Scenario: DOCX Document`)
2. Right-click folder → **Run folder**
3. Postman Runner executes complete workflow:
   - Load sample with dynamic ID
   - Upload content to S3
   - CREATE document (Scenario 1)
   - UPDATE document (Scenario 2)
   - Validate results
4. Verify all tests pass (green checkmarks)

**Option B: Run with Newman CLI**

```bash
cd /home/xmarchena/code/doc-ndserver-sync-wrk-postman-collection

# Run specific scenario
./node_modules/.bin/newman run doc-ndserver-sync-wrk-POC.postman_collection.json \
  -e doc-ndserver-sync-wrk-POC.postman_environment.json \
  --folder "05 - Test Scenario: DOCX Document"

# Run all test scenarios sequentially
./node_modules/.bin/newman run doc-ndserver-sync-wrk-POC.postman_collection.json \
  -e doc-ndserver-sync-wrk-POC.postman_environment.json
```

**Option C: Load sample and use original POC workflow**

1. Navigate to `01 - Load Sample Document`
2. Run desired sample (e.g., "Load Sample: PDF Document")
3. Run original POC folders: `01a`, `02`, `03`, `04`

### File Type Coverage

Based on production analysis of 10,000 messages:

| File Type | Extension | Coverage | Sample Available |
|-----------|-----------|----------|------------------|
| Text | txt | 45% | ✅ sample_simple_document |
| Word | docx | 25% | ✅ sample_docx_document |
| WOPI Test | wopitest | 12% | ✅ sample_wopi_test |
| Folder | ndfld | 8% | ✅ sample_folder_document |
| Email | eml | 3% | ✅ sample_email |
| PDF | pdf | <1% | ✅ sample_pdf_document |
| Archived | txt (status=1) | 3% | ✅ sample_archived |
| **Total** | | **93%** | **7 samples** |

### Transformation Requirements

**No transformation logic changes needed!** The POC naturally handles all file types:

- Extension field (`exten`) already extracted by POC
- Status flags (archived) already handled by `calculateDocumentState()`
- No new metadata structures to parse
- Same API call sequence for all types

### What's Different Per Document Type

**DOCX, PDF, TXT, WOPI Test:**
- Only difference is extension field
- File sizes vary
- No special handling required

**Folder Container (.ndfld):**
- Extension: `ndfld`
- Very small size (typically <100 bytes)
- Represents folder, not file
- Console logs note about folder container

**Email (.eml):**
- Extension: `eml`
- Contains `emailProps` field (not actively processed in POC)
- Future: User Story 4 will parse email metadata

**Archived Document:**
- Extension: `txt`
- Status: `1` (Archived flag)
- POC correctly calculates state as "ARCHIVED"
- Tests status flag bitwise operation

### Supporting API Calls

**New utility requests in folder `99 - Supporting API Calls`:**

1. **Get Document by ID (Extended)** - Retrieve complete metadata
2. **Get Document by ID (Basic)** - Retrieve basic metadata only
3. **Delete Document by ID** - Remove test documents (use with caution)
4. **Get Cabinet Info** - Retrieve cabinet metadata

Use these for manual testing, debugging, or cleanup after test scenarios.

### Expected Results

Each test scenario should:
- ✅ Load sample successfully with dynamic document ID
- ✅ Upload content to S3 via presigned URL
- ✅ CREATE document in Scenario 1 (404 → 200)
- ✅ UPDATE document in Scenario 2 (200 → 200)
- ✅ Pass all validation tests
- ✅ Console logs show clear progress

### Documentation

For detailed information about each sample:
- **SAMPLES-REFERENCE-PART1.md** - Complete documentation of all 7 basic samples
- **samples/README.md** - Sample directory documentation
- **samples/SAMPLE_MANIFEST.txt** - Quick reference inventory

## Troubleshooting

### ❌ 401 Unauthorized
**Cause**: Token expired or invalid
**Solution**: Re-run token generation commands and update environment

### ❌ 504 Gateway Timeout / Connection Refused
**Cause**: VPN disconnected or services not accessible
**Solution**: Reconnect to VPN, verify you can reach `*.lb.service` hosts

### ❌ "Sample not found in environment"
**Cause**: Sample variable not loaded
**Solution**: Re-import environment file, ensure `sample_simple_document` variable exists

### ❌ Validation tests failing
**Cause**: Previous run left document in unexpected state
**Solution**: Run POC again with fresh dynamic document ID (auto-generated)

### ❌ Script errors in console
**Cause**: Invalid JSON or missing variables
**Solution**: Check that nmdMessage is set correctly in "Load Sample" step

## What Happens in the POC

### 1. Load Sample Document
- Sets `nmdMessage` variable with test data
- **Generates dynamic document ID** (format: XXXX-XXXX-XXXX)
- Extracts `documentId` and `cabinetId`
- Sample represents a simple .txt document with 1 version
- Stores for both scenarios

### 2. Upload Initial Content
- **Step 1**: Extracts content metadata from NMD message (script only)
  - Filename: `79 REST v2 - File to Folder - Destination Fi Org.txt`
  - Extension: `txt`
  - User ID: `DUCOT-pbs.nonadmin`
  - Stores in environment variables
- **Step 2**: Calls `POST /v1/content/{documentId}/versions/1/snapshots`
  - Creates snapshot entity in Content API
  - Receives presigned S3 URL for upload
  - Saves presigned URL and object key
- **Step 3**: Calls `PUT {presignedUrl}`
  - Uploads test content directly to S3
  - Content: ~300 bytes of test text
  - Verifies successful upload (200 OK)
- **Step 4**: Calls `GET /v1/content/{documentId}/versions/1/snapshots`
  - Retrieves list of snapshots
  - Verifies uploaded snapshot exists
  - Confirms extension and size are correct

### 3. Scenario 1: New Document Creation
- **Step 1**: Calls `GET /v1/documents/extended/{documentId}`
  - Expected: 404 (document doesn't exist yet)
  - Sets `isNewDocument = true`
- **Step 2**: Calls `PUT /v1/content/{documentId}/metadata`
  - Sets document root: `["NG-8RZI6EOH/documents"]`
  - Configures S3 storage location
- **Step 3**: Transforms NMD message → PatchDocumentRequest (script only)
  - Converts dates from `/Date(ms)/` → ISO 8601
  - Builds ACL from rights string (VESD → viewer, editor, sharer, administrator)
  - Builds version metadata
  - Extracts DLP info (if present)
  - Extracts custom attributes (if present)
- **Step 4**: Calls `PATCH /v1/documents/extended/{documentId}`
  - Creates new document with metadata, versions, and ACL
  - Returns 200 OK with created document

### 4. Scenario 2: Document Update
- **Step 1**: Calls `GET /v1/documents/extended/{documentId}`
  - Expected: 200 (document now exists from Scenario 1)
  - Sets `isNewDocument = false`
  - Stores existing document for comparison
- **Step 2**: Calls `PUT /v1/content/{documentId}/metadata`
  - Updates document root (same as before)
- **Step 3**: Transforms NMD message → PatchDocumentRequest (script only)
  - **Simulates changes**: Appends " [UPDATED]" to document name
  - Updates modified timestamp to current time
  - Increments DocModNum by 1
  - Increments NameModNum by 1
- **Step 4**: Calls `PATCH /v1/documents/extended/{documentId}`
  - Updates existing document with new metadata
  - Returns 200 OK with updated document

### 5. Validation
- Calls `GET /v1/documents/extended/{documentId}` multiple times
- Validates document metadata (ID, state, cabinet, name, envUrl)
- Validates version information (versionId, label, extension, state, timestamps)
- Validates ACL transformation (subject types, relations mapping)
- Validates ModNums (DocModNum incremented, timestamps updated)
- Prints comprehensive summary of final document state

## POC Scope

**Included in POC:**
- ✅ New document creation (Scenario 1)
- ✅ Existing document update (Scenario 2)
- ✅ Dynamic document ID generation
- ✅ Data integrity validation
- ✅ Basic metadata sync
- ✅ Single version handling
- ✅ ACL transformation (user + group)
- ✅ Date conversion (/Date(ms)/ → ISO 8601)
- ✅ Content root configuration
- ✅ ModNum tracking and increment
- ✅ Comprehensive test assertions
- ✅ Content upload to S3 (snapshot creation + presigned URL)
- ✅ Snapshot verification

**Not Included in POC (future enhancements):**
- ❌ DLP policies (structure in place, no sample data)
- ❌ Custom attributes delta logic (extraction only)
- ❌ Folder tree hierarchies
- ❌ Multiple versions (only v1)
- ❌ Discovery workflow (attachments, snapshots)
- ❌ Email properties parsing
- ❌ Comparison logic (sends full patch, not just changed fields)
- ❌ Document state transitions (ARCHIVED, DELETED)
- ❌ Locked/checked-out status
- ❌ Legacy signatures extraction

## Key Differences from Production Worker

The POC **simplifies** the full worker implementation:

1. **Patch Comparison**: POC sends full document state; production only sends changed fields
2. **Custom Attributes**: POC extracts attributes; production calculates add/update/delete deltas
3. **Raw Message Parsing**: POC doesn't parse alerts, approvals, or emails from raw XML/JSON
4. **Discovery**: POC doesn't implement first-time sync discovery workflow
5. **Kafka Events**: POC can't publish events (Postman limitation)
6. **Status Flags**: POC uses simplified locked/checked-out logic

**However**, the POC correctly implements:
- ✅ API call sequence (check existence → content root → patch metadata)
- ✅ Date transformation (NetDocuments format → ISO 8601)
- ✅ ACL mapping (VESD rights → SpiceDB relations)
- ✅ Subject type detection (UG-, NG-, DUCOT- prefixes)
- ✅ Version metadata structure
- ✅ Document state determination
- ✅ Two complete scenarios (CREATE and UPDATE)

---

**Estimated Time**: 20-25 minutes to run complete POC with validation

**Ready?** Import the files and follow the steps above! 🚀
