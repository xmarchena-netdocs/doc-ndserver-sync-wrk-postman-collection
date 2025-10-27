# User Stories: doc-ndserver-sync-wrk Postman Collection

## Overview

This document contains focused user stories for implementing the `doc-ndserver-sync-wrk` Postman Collection, progressing from a POC demonstration to a production-ready comprehensive implementation.

---

## User Story 1: POC Two-Scenario Workflow with Validation ✅

**As a** developer testing the sync worker
**I want** a POC Postman collection demonstrating two complete scenarios (CREATE and UPDATE)
**So that** I can verify the basic synchronization workflow works end-to-end and understand the worker's behavior

### Priority
**HIGHEST** - Foundation for all subsequent work

### Acceptance Criteria

#### Environment Setup
- ✅ Postman environment file: `doc-ndserver-sync-wrk-POC.postman_environment.json`
- ✅ Environment variables configured:
  - Base URLs: `metadataBaseUrl`, `contentBaseUrl`
  - Token variables: `metadataToken`, `contentToken` (manually set)
  - Working variables: `documentId`, `cabinetId`, `nmdMessage`, `patchRequest`, `isNewDocument`, `existingDocument`
  - Sample data: `sample_simple_document` (embedded JSON)
- ✅ QA environment pointing to `*.lb.service` internal endpoints

#### Collection Structure (5 Folders)
- ✅ **Folder 01**: Load Sample Document
  - Request: "Load Sample: Simple Document"
  - **Generates dynamic document ID** (XXXX-XXXX-XXXX format) to avoid conflicts
  - Sets `nmdMessage`, `documentId`, `cabinetId` environment variables
  - Console logs sample loaded confirmation

- ✅ **Folder 01a**: Upload Initial Content
  - Request 1: Extract Content Metadata (script only)
  - Request 2: Create Snapshot & Get Presigned URL (`POST /v1/content/{documentId}/versions/1/snapshots`)
  - Request 3: Upload Content to S3 (`PUT {presignedUrl}`)
  - Request 4: Verify Snapshot Exists (`GET /v1/content/{documentId}/versions/1/snapshots`)

- ✅ **Folder 02**: Scenario 1 - New Document Creation (404 → CREATE)
  - Request 1: Check Document Existence (`GET /v1/documents/extended/{documentId}`)
    - Expected: 404 Not Found
    - Sets `isNewDocument = true`
  - Request 2: Configure Content Root (`PUT /v1/content/{documentId}/metadata`)
    - Body: `{ documentRoot: ["NG-8RZI6EOH/documents"], source: "doc-ndserver-sync-wrk" }`
  - Request 3: Build CREATE Patch Request (script only, no HTTP call)
    - Transforms full NMD message → PatchDocumentRequest
    - Sets `patchRequest` environment variable
  - Request 4: CREATE Document (`PATCH /v1/documents/extended/{documentId}`)
    - Sends complete document metadata
    - Expected: 200 OK with created document

- ✅ **Folder 03**: Scenario 2 - Document Update (200 → UPDATE)
  - Request 1: Check Document Existence (`GET /v1/documents/extended/{documentId}`)
    - Expected: 200 OK (document exists from Scenario 1)
    - Sets `isNewDocument = false`, stores `existingDocument`
  - Request 2: Update Content Root (`PUT /v1/content/{documentId}/metadata`)
  - Request 3: Build UPDATE Patch Request (script only)
    - Simulates changes: name += " [UPDATED]", timestamps updated, ModNums incremented
  - Request 4: UPDATE Document (`PATCH /v1/documents/extended/{documentId}`)
    - Expected: 200 OK with updated document

- ✅ **Folder 04**: Validation
  - Request 1: Validate Document Metadata
    - Tests: Document exists (200), ID matches, state=ACTIVE, name contains "[UPDATED]", EnvUrl set
  - Request 2: Validate Versions
    - Tests: Version 1 exists, extension="txt", label="1.0", state=ACTIVE, timestamps present
  - Request 3: Validate ACL
    - Tests: 2 ACL entries, group entry (UG-LGSFSO0I), user entry (DUCOT-pbs.nonadmin), VESD relations correct
  - Request 4: Validate ModNums
    - Tests: DocModNum incremented in Scenario 2, timestamps updated
  - Request 5: Validation Summary
    - Console logs comprehensive final state report

#### Core Transformation Logic
- ✅ **Date Conversion**: `/Date(1761248460620)/` → `2025-10-23T19:41:00.620Z`
  ```javascript
  function convertNetDocumentsDate(dateStr) {
      const match = dateStr.match(/\d+/);
      return match ? new Date(parseInt(match[0])).toISOString() : null;
  }
  ```

- ✅ **Document State Calculation**: Based on NMD status flags (bitwise)
  ```javascript
  const NmdDocStatusFlags = {
      Archived: 1,
      Autoversion: 2,
      CheckedOut: 4,
      Locked: 8,
      CollabEdit: 16
  };

  function calculateDocumentState(nmdMessage, existingDocument) {
      const docProps = nmdMessage.documents['1'].docProps;
      const isDeleted = docProps.deleted === true;
      const status = docProps.status || 0;
      const isArchived = (status & NmdDocStatusFlags.Archived) !== 0;

      if (isDeleted) return 'DELETED';
      if (isArchived) return 'ARCHIVED';
      return 'ACTIVE';
  }
  ```

- ✅ **ACL Transformation**: NetDocuments rights (VESD) → SpiceDB relations
  ```javascript
  function buildAcl(nmdAcl) {
      const rightsMap = {
          'V': 'viewer',
          'E': 'editor',
          'S': 'sharer',
          'D': 'administrator'
      };

      return (nmdAcl || []).map(entry => {
          const relations = entry.rights.split('')
              .map(r => rightsMap[r])
              .filter(Boolean);

          return {
              SubjectType: determineSubjectType(entry.guid),
              SubjectId: entry.guid,
              Relations: relations
          };
      });
  }

  function determineSubjectType(guid) {
      if (guid.startsWith('UG-')) return 'group';
      if (guid.startsWith('NG-')) return 'cabinet';
      if (guid.startsWith('DUCOT-')) return 'user';
      return 'user';
  }
  ```

- ✅ **Version Metadata Builder**
  ```javascript
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
  ```

- ✅ **Complete Patch Request Builder**
  - Orchestrates all transformations
  - Builds complete PatchDocumentRequest structure
  - Includes: metadata, versions, ACL, DLP, custom attributes, timestamps, ModNums

#### Sample Data
- ✅ `sample_simple_document`: Simple .txt document with 1 version
  - Document ID: Dynamically generated (XXXX-XXXX-XXXX)
  - Cabinet ID: NG-8RZI6EOH
  - 1 version (v1, label 1.0, extension txt, size ~300 bytes)
  - ACL: 2 entries (group UG-LGSFSO0I with VESD, user DUCOT-pbs.nonadmin with VESD)
  - No DLP policies
  - No custom attributes
  - No folder tree

#### Console Logging
- ✅ Each request logs its purpose and result
- ✅ Sample loading shows document ID and cabinet ID
- ✅ Scenario 1 logs: "Document not found (404) - CREATE mode"
- ✅ Scenario 2 logs: "Document found (200) - UPDATE mode"
- ✅ Transformation scripts log: transformed field counts
- ✅ Validation logs: pass/fail for each check
- ✅ Summary logs: comprehensive final state

#### Test Assertions
- ✅ Each validation request includes Postman tests using `pm.test()`
- ✅ Tests verify:
  - HTTP status codes (200, 204, 404)
  - Response body structure
  - Data integrity (IDs match, state correct, transformations accurate)
  - ACL relations mapping
  - ModNum increments
  - Timestamp presence

#### Newman CLI Compatibility
- ✅ Collection can run via Newman:
  ```bash
  newman run doc-ndserver-sync-wrk-POC.postman_collection.json \
    -e doc-ndserver-sync-wrk-POC.postman_environment.json
  ```
- ✅ All requests execute sequentially
- ✅ Environment variables persist across requests
- ✅ Test results displayed in Newman output

#### Documentation
- ✅ **POC-QUICKSTART.md**: Comprehensive quick start guide
  - Setup instructions (import, obtain tokens, set tokens)
  - Expected results for each step
  - Troubleshooting section
  - What happens in each folder
  - POC scope and limitations
  - Differences from production worker

### POC Simplifications (Documented)
The POC intentionally simplifies certain aspects for demonstration:

1. **Patch Comparison**: Sends **full document state**; production sends **only changed fields**
2. **Custom Attributes**: Extracts only; production calculates **add/update/delete deltas**
3. **First-Time Sync**: Uses 404 check only; production checks **DocumentId + CabinetId + EnvUrl**
4. **Token Generation**: Uses **TokenGenerator**; plan mentions service-to-service-cli
5. **Discovery Workflow**: **Not implemented**; production discovers attachments and snapshots
6. **Kafka Events**: **Cannot publish** (Postman limitation)
7. **Raw Message Parsing**: Uses pre-formatted JSON; production parses alerts/approvals/emails
8. **Document State Immutability**: Not enforced; production prevents reverting to PENDING
9. **Multiple Versions**: Only handles 1 version; production handles many
10. **Complex Features**: No DLP, custom attributes delta, folder trees, email properties, etc.

### What POC Does Correctly ✅
- API call sequence (check existence → content root → patch metadata)
- Date transformation (NetDocuments format → ISO 8601)
- ACL mapping (VESD rights → SpiceDB relations)
- Subject type detection (UG-, NG-, DUCOT- prefixes)
- Version metadata structure
- Document state determination (ACTIVE, ARCHIVED, DELETED)
- Two complete scenarios (CREATE and UPDATE)
- Content upload workflow (snapshot + S3 presigned URL)
- Data integrity validation

### Definition of Done
- ✅ POC collection imported into Postman successfully
- ✅ Environment file loaded with correct base URLs
- ✅ Tokens obtained manually and set in environment
- ✅ Load Sample request generates dynamic document ID
- ✅ Upload Content workflow completes (snapshot created, content uploaded to S3)
- ✅ Scenario 1 completes successfully (document created)
- ✅ Scenario 2 completes successfully (document updated)
- ✅ All 5 validation requests pass with green tests
- ✅ Console logs show clear progress at each step
- ✅ Newman CLI execution completes without errors
- ✅ POC-QUICKSTART.md documentation complete and accurate
- ✅ Collection demonstrates core sync workflow

### Estimated Effort
**8 hours** ✅ COMPLETED

### Status
**✅ COMPLETED** - POC implemented and documented per POC-QUICKSTART.md

---

## User Story 2: Basic Document Types & File Extensions

**As a** developer validating the sync worker with real production data
**I want** to add samples for all major document file types and basic document states
**So that** I can verify the collection handles different file extensions and basic document lifecycle states

### Priority
**HIGH** - Build on POC foundation with core document types

### Background
The POC successfully demonstrates CREATE and UPDATE scenarios with a simple .txt document. Now we need to expand coverage to handle the core document types found in production (Office docs, PDFs, emails, folders, WOPI test files) and basic document states (archived). This story keeps the **same simple transformation logic** from the POC (full document state, no optimization).

**Key Principle:** Validate POC works with all major file types before adding metadata complexity.

**Domain:** File types and basic document states (extension-driven + simple status flags)

### Acceptance Criteria

#### 1. Add Core Document Type Samples (6 New Samples) ✅

**All samples created in `samples/` directory** - See `samples/README.md` and `samples/SAMPLE_MANIFEST.txt`

**Samples for "01 - Sample NMD Messages" folder:**

1. ✅ **samples/sample_simple_document.json** (POC - baseline)
   - ID: 4817-7713-8883
   - exten: "txt"
   - Baseline document from POC
   - Status: Already created

2. ✅ **samples/sample_docx_document.json** - Word document
   - ID: 4817-7714-0001
   - exten: "docx"
   - Standard Office document
   - Represents 25% of production documents

3. ✅ **samples/sample_pdf_document.json** - PDF file
   - ID: 4817-7714-0002
   - exten: "pdf"
   - Read-only document type
   - Common in production

4. ✅ **samples/sample_folder_document.json** - Folder container
   - ID: 4817-7714-0003
   - exten: "ndfld"
   - Represents a folder (not a file)
   - Found in 210+ production documents (8% of sample)

5. ✅ **samples/sample_wopi_test.json** - WOPI test file
   - ID: 4817-7714-0004
   - exten: "wopitest"
   - Used for Office 365 integration testing
   - Found in 55+ production documents (12% of QA sample)

6. ✅ **samples/sample_email.json** - Email document
   - ID: 4817-7714-0005
   - exten: "eml"
   - Email with basic properties (emailProps field)
   - Found in 3% of production documents

7. ✅ **samples/sample_archived.json** - Archived document
   - ID: 4817-7714-0006
   - exten: "txt"
   - status: 1 (Archived flag)
   - Tests basic status flag handling

**Coverage:** txt (45%), docx (25%), wopitest (12%), ndfld (8%), eml (3%) = 93% of production file types

**Sample Source:**
- All samples stored in `samples/` directory as standalone JSON files
- Based on real production patterns from 10,000 message analysis
- Sample IDs use sequential pattern: 4817-7714-XXXX
- Each sample documented in `samples/README.md` with production statistics
- See `samples/SAMPLE_MANIFEST.txt` for complete inventory

#### 2. Add "Load Sample" Requests for Each Document Type

**In folder "01 - Sample NMD Messages":**
- 7 requests (one per sample): "Load Sample: [Type]"
- Each reads from `samples/sample_[type].json` file
- Each sets `nmdMessage` environment variable with file contents
- Each generates unique document ID (preserving sample ID pattern or creating new)
- Console logs which sample was loaded and key properties (extension, ID, status)

**Implementation approach:**
- Postman requests read JSON files using `pm.sendRequest()` or pre-populate as environment variables
- Alternative: Use Postman's data file feature to load from `samples/` directory
- Each "Load Sample" request template:
  ```javascript
  // Read sample from file
  const sampleName = 'sample_docx_document';
  const sampleData = JSON.parse(pm.environment.get(sampleName));

  pm.environment.set('nmdMessage', JSON.stringify(sampleData));
  pm.environment.set('documentId', sampleData.documents['1'].docProps.id);

  console.log(`✅ Loaded: ${sampleName}`);
  console.log(`   Extension: ${sampleData.documents['1'].versions['1'].verProps.exten}`);
  ```

#### 3. Run All Samples Through Existing POC Workflow

**No changes to transformation logic** - use existing POC code.

**For each sample, create test scenario in "05 - Sample Testing - Basic Types":**
- Load sample
- Run Scenario 1 (CREATE)
- Run Scenario 2 (UPDATE) with minor modification
- Run Validation

**7 test scenarios total**, each following POC pattern:
1. Simple .txt (already validated in POC)
2. DOCX document
3. PDF document
4. Folder document (.ndfld)
5. WOPI test file
6. Email document
7. Archived document (basic status flag)

#### 4. No Transformation Logic Changes Required

**POC transformation logic handles all these samples naturally:**
- Different file extensions (exten field) - already extracted
- Basic status flags (status: 1 for archived) - already handled by `calculateDocumentState()`
- No new metadata structures to parse

**Validation:** Existing POC validation works for all file types.

#### 5. Supporting API Calls (Optional Utilities)

**Create folder "06 - Supporting API Calls":**
- Get Document by ID (extended)
- Get Document by ID (basic)
- Delete Document by ID
- Get Cabinet Info

These are utility requests for manual testing/debugging.

#### 6. Documentation

**Update POC-QUICKSTART.md:**
- Add section "Testing Different Document Types"
- List all 7 samples with descriptions
- Explain how to run each test scenario
- Include file type distribution from production

**Create SAMPLES-REFERENCE-PART1.md:**
- Document all 7 basic type samples
- Explain key fields in each
- Include production statistics (how common each type is)
- Show example JSON structure for each

### Definition of Done
- [x] All 7 samples created in `samples/` directory ✅
- [x] samples/README.md documentation complete ✅
- [x] samples/SAMPLE_MANIFEST.txt inventory created ✅
- [ ] All 7 "Load Sample" requests created in Postman collection
- [ ] All 7 test scenarios pass (CREATE + UPDATE + Validation)
- [ ] Folder documents (.ndfld) handled correctly
- [ ] WOPI test files handled correctly
- [ ] Email documents (with emailProps) handled correctly
- [ ] Archived document status handled correctly
- [ ] POC-QUICKSTART.md updated with document type testing instructions
- [ ] SAMPLES-REFERENCE-PART1.md created with basic type documentation (or reference samples/README.md)
- [ ] Newman CLI executes all 7 scenarios successfully
- [ ] Console logs clear for each sample type
- [ ] All validation tests pass
- [ ] 93% of production file types covered (txt, docx, wopitest, ndfld, eml, pdf)
- [ ] All samples verified with correct IDs (4817-7714-XXXX pattern)

### Estimated Effort
**4 hours** (reduced from 6 - samples already created ✅)
- ~~Create 6 new samples (extract from logs): 1.5 hours~~ ✅ DONE
- Create 7 "Load Sample" requests in Postman: 0.5 hour
- Create 7 test scenarios (following POC pattern): 1.5 hours
- Supporting API calls folder: 0.5 hour
- Documentation (POC-QUICKSTART update + reference samples/README.md): 0.5 hour
- Testing and validation: 1 hour

**Why this is easy:**
- ✅ All 7 samples already created in `samples/` directory
- ✅ Samples already validated with correct structure and IDs
- ✅ samples/README.md and SAMPLE_MANIFEST.txt already documented
- No transformation logic changes (POC handles all these naturally)
- No new metadata structures to parse
- Just testing POC with different file extensions
- Basic status flag (archived) already supported by POC

---

## User Story 3: Advanced Document Features & Metadata

**As a** developer validating the sync worker with complex production metadata
**I want** to add samples for documents with advanced metadata structures (custom attributes, signatures, indexes, WOPI locks, versions, ACLs)
**So that** I can verify the collection correctly extracts and handles all complex metadata patterns found in production

### Priority
**HIGH** - Complete sample coverage before optimization

### Background
Story 2 established that POC works with all major file types. Now we need to test complex metadata structures that require new field extraction logic: custom attributes, digital signatures (signature| keys), index locations (COUCHBASE indexes), WOPI collaboration metadata, checked-out status, multiple versions, multiple ACL entries, and snapshots. This story still uses POC logic (full document state) but adds **minimal extraction functions** for new metadata.

**Key Principle:** Add field extraction for complex metadata, keep POC transformation logic.

**Domain:** Advanced metadata structures (custom attributes, signatures, indexes, WOPI, versions, ACLs, snapshots)

### Acceptance Criteria

#### 1. Add Advanced Metadata Samples (11 New Samples) ✅

**All samples created in `samples/` directory** - See `samples/README.md` for full documentation

**Samples for "01 - Sample NMD Messages" folder:**

8. ✅ **samples/sample_custom_attributes.json** - Document with 3+ custom attributes
   - ID: 4817-7714-0007
   - cp|CA-WJUDJA7A|1: "001"
   - cp|CA-WJUDJA7A|2: "002"
   - cp|CA-WJUDJA7A|100: "Custom Value"
   - Tests custom attribute extraction (no delta calculation yet)

9. ✅ **samples/sample_folder_tree.json** - Document in nested folders
   - ID: 4817-7714-0008
   - foldertree: ["/Level1|/Level1/Level2|/Level1/Level2/Level3"]
   - parentfolder: "/Level1/Level2/Level3"
   - Tests folder hierarchy parsing

10. ✅ **samples/sample_wopi_with_lock.json** - Document with active WOPI lock
    - ID: 4817-7714-0009
    - wopiLock: "WOPI_LOCK_STRING_12345"
    - wopiLockExpiration: "/Date(1761348460000)/"
    - contentTag: "version-tag-abc123"
    - Found in 26+ production documents
    - **NEW EXTRACTION REQUIRED**

11. ✅ **samples/sample_signature.json** - Document with digital signature
    - ID: 4817-7714-0010
    - signature|1|4728e288-3ea4-4831-9199-616b261dcdd4: {verNo, timeStamp, sigType, signer, signerGuid, sigData}
    - Found in 100+ production documents (5%)
    - **NEW EXTRACTION REQUIRED**

12. ✅ **samples/sample_with_indexes.json** - Document with index locations
    - ID: 4817-7714-0011
    - indexType-Metadata: "COUCHBASE"
    - indexLocation-Metadata: "/Ducot3/1/1/2/9/~251023154100603-1.mdi"
    - indexType-FullText, indexLocation-FullText
    - indexType-Entities, indexLocation-Entities
    - Found in 217+ production documents (11% of sample)
    - **NEW EXTRACTION REQUIRED**

13. ✅ **samples/sample_checked_out.json** - Checked out document
    - ID: 4817-7714-0012
    - status: 4 (CheckedOut flag)
    - actionBy: "John Doe", actionDate, actionComment
    - Tests checkout status parsing

14. ✅ **samples/sample_collab_edit.json** - Collaboration edit active
    - ID: 4817-7714-0013
    - status: 17 (CheckedOut + Archived + CollabEdit)
    - collabEditType: "Wopi CSPP"
    - wopiLock: "COLLAB_LOCK_67890"
    - Combines WOPI lock + collab status

15. ✅ **samples/sample_multiple_versions.json** - Document with 3 versions
    - ID: 4817-7714-0014
    - Version 2 parent: 1
    - Version 3 parent: 2
    - officialVersion: 2
    - Tests multi-version extraction

16. ✅ **samples/sample_multiple_acl.json** - Document with 6 ACL entries
    - ID: 4817-7714-0015
    - Mix of users (DUCOT-user1/2/3), groups (UG-), cabinets (NG-)
    - Tests ACL with complex permission sets

17. ✅ **samples/sample_multiple_snapshots.json** - Version with 3 snapshots
    - ID: 4817-7714-0016
    - Represents edit history during collaboration
    - Tests snapshot metadata

18. ✅ **samples/sample_complex.json** - All features combined
    - ID: 4817-7714-0017
    - Multiple versions + custom attributes + folder tree + signature + indexes + WOPI
    - Comprehensive validation sample

**Coverage:** All complex metadata patterns observed in production (100%)

**Sample Source:**
- All samples stored in `samples/` directory as standalone JSON files
- Based on real production patterns from 10,000 message analysis
- Sample IDs use sequential pattern: 4817-7714-XXXX
- Complete documentation in `samples/README.md` with production statistics
- Inventory available in `samples/SAMPLE_MANIFEST.txt`

#### 2. Add "Load Sample" Requests for Advanced Metadata

**In folder "01 - Sample NMD Messages":**
- 11 requests (one per advanced sample): "Load Sample: [Type]"
- Each reads from `samples/sample_[type].json` file
- Each sets `nmdMessage` environment variable with file contents
- Each generates unique document ID (preserving sample ID pattern)
- Console logs sample name and key metadata features loaded

**Implementation approach:**
- Same pattern as Story 2 samples
- Each "Load Sample" request logs the metadata features present:
  ```javascript
  // Read sample from file
  const sampleName = 'sample_wopi_with_lock';
  const sampleData = JSON.parse(pm.environment.get(sampleName));

  pm.environment.set('nmdMessage', JSON.stringify(sampleData));
  pm.environment.set('documentId', sampleData.documents['1'].docProps.id);

  // Log metadata features
  const verProps = sampleData.documents['1'].versions['1'].verProps;
  console.log(`✅ Loaded: ${sampleName}`);
  console.log(`   ID: ${sampleData.documents['1'].docProps.id}`);
  if (verProps.wopiLock) console.log(`   ✓ WOPI Lock: ${verProps.wopiLock}`);
  if (verProps.contentTag) console.log(`   ✓ Content Tag: ${verProps.contentTag}`);
  ```

#### 3. Run All Samples Through POC Workflow

**For each sample, create test scenario in "05 - Sample Testing - Advanced Metadata":**
- Load sample
- Run Scenario 1 (CREATE)
- Run Scenario 2 (UPDATE) with minor modification
- Run Validation

**11 test scenarios total:**
8. Custom attributes
9. Folder tree
10. WOPI with lock
11. Digital signature
12. Index locations
13. Checked out document
14. Collaboration edit
15. Multiple versions
16. Multiple ACL entries
17. Multiple snapshots
18. Complex (all features)

#### 4. Add Minimal Field Extraction Logic

**A. Extract WOPI fields** (add to `buildVersionsList()`):
```javascript
WopiLock: verProps.wopiLock || null,
WopiLockExpiration: verProps.wopiLockExpiration ?
    convertNetDocumentsDate(verProps.wopiLockExpiration) : null,
ContentTag: verProps.contentTag || null
```

**B. Extract signatures** (add to `buildPatchRequest()`):
```javascript
function extractSignatures(docProps) {
    const signatures = [];
    for (const [key, value] of Object.entries(docProps)) {
        if (key.startsWith('signature|')) {
            const parts = key.split('|');
            if (parts.length === 3) {
                signatures.push({
                    VersionNo: parseInt(parts[1]),
                    SignatureId: parts[2],
                    TimeStamp: convertNetDocumentsDate(value.timeStamp),
                    SignatureType: value.sigType,
                    Signer: value.signer,
                    SignerGuid: value.signerGuid,
                    SignatureData: value.sigData
                });
            }
        }
    }
    return signatures.length > 0 ? signatures : null;
}
```

**C. Extract index locations** (add to `buildPatchRequest()`):
```javascript
function extractIndexLocations(docProps) {
    const indexes = {};
    if (docProps['indexType-Metadata']) {
        indexes.Metadata = {
            Type: docProps['indexType-Metadata'],
            Location: docProps['indexLocation-Metadata']
        };
    }
    if (docProps['indexType-FullText']) {
        indexes.FullText = {
            Type: docProps['indexType-FullText'],
            Location: docProps['indexLocation-FullText']
        };
    }
    if (docProps['indexType-Entities']) {
        indexes.Entities = {
            Type: docProps['indexType-Entities'],
            Location: docProps['indexLocation-Entities']
        };
    }
    return Object.keys(indexes).length > 0 ? indexes : null;
}
```

**D. Custom attributes, folder tree, versions, ACLs, snapshots:**
Already extracted by POC logic - no changes needed.

#### 5. Expand Supporting API Calls

**Expand folder "06 - Supporting API Calls":**
- List Attachments (document-level)
- List Attachments (version-level)
- List Snapshots (per version)

#### 6. Documentation

**Update POC-QUICKSTART.md:**
- Add section "Testing Advanced Metadata"
- Explain new extraction functions
- List all 11 advanced samples

**Create SAMPLES-REFERENCE-PART2.md:**
- Document all 11 advanced metadata samples
- Explain metadata structures (signatures, indexes, WOPI)
- Include production statistics
- Show example JSON for each metadata type

### Definition of Done
- [x] All 11 advanced samples created in `samples/` directory ✅
- [x] samples/README.md documents all 11 advanced samples ✅
- [x] samples/SAMPLE_MANIFEST.txt includes all advanced samples ✅
- [x] All samples validated with correct IDs (4817-7714-XXXX) ✅
- [ ] All 11 "Load Sample" requests created in Postman collection
- [ ] All 11 test scenarios pass (CREATE + UPDATE + Validation)
- [ ] WOPI fields (wopiLock, wopiLockExpiration, contentTag) extracted
- [ ] Signatures (signature| keys) extracted and included in patch
- [ ] Index locations (Metadata, FullText, Entities) extracted
- [ ] Custom attributes extracted (full values, no delta yet)
- [ ] Folder tree parsing working
- [ ] Multiple versions handled correctly
- [ ] Multiple ACL entries handled correctly
- [ ] Multiple snapshots handled correctly
- [ ] Checked-out and collaboration edit status parsed
- [ ] Complex sample validates all features together
- [ ] POC-QUICKSTART.md updated with advanced metadata section
- [ ] SAMPLES-REFERENCE-PART2.md created (or reference samples/README.md)
- [ ] Newman CLI executes all 11 scenarios successfully
- [ ] All validation tests pass
- [ ] 100% of production metadata patterns covered

### Estimated Effort
**7 hours** (reduced from 10 - samples already created ✅)
- ~~Create 11 new samples (extract from logs): 3 hours~~ ✅ DONE
- Create 11 "Load Sample" requests in Postman: 1 hour
- Add WOPI/signature/index extraction functions: 2 hours
- Create 11 test scenarios (following POC pattern): 2 hours
- Expand supporting API calls: 0.5 hour
- Documentation (POC-QUICKSTART update + reference samples/README.md): 0.5 hour
- Testing and validation: 1 hour

**Why this completes the sample domain:**
- ✅ All 18 samples now created (7 basic + 11 advanced)
- ✅ All samples stored in `samples/` directory with complete documentation
- ✅ samples/README.md and SAMPLE_MANIFEST.txt provide full reference
- ✅ All production metadata patterns covered (100%)
- Still using POC logic (no optimization yet)
- Ready for Story 4 to add complexity (patch comparison, delta calculation)

---

## User Story 4: Add Production Complexity (Patch Comparison, Delta Calculation, Multi-Version, Discovery)

**As a** developer creating a production-ready collection
**I want** to add production-grade optimization (patch comparison, delta calculation) and support for multi-version documents, first-time sync discovery, and complex document structures
**So that** I can replicate full production worker functionality with optimized payloads matching the C# worker

### Priority
**MEDIUM** - Completes production-grade collection

### Background
Stories 2-3 established complete sample coverage (18 samples: 7 basic types + 11 advanced metadata) using simple POC logic (full document state). Now we add **complexity and optimization** to match production:
1. **Patch comparison logic**: Send only changed fields (not full document state)
2. **Custom attributes delta calculation**: Calculate add/update/delete operations
3. **Multi-version support**: Handle documents with multiple versions (v1, v2, v3, ...)
4. **First-time sync detection**: Use DocumentId + CabinetId + EnvUrl check (not just 404)
5. **Content discovery workflow**: Discover attachments and snapshots on first sync
6. **Complex document features**: Advanced parsing for DLP, email, alerts, approvals
7. **Document state management**: PENDING, ACTIVE, ARCHIVED, DELETED with immutability rules
8. **Lock and checkout status**: Handle all status flags correctly

**Key Principle:** Match production worker behavior exactly - optimize payloads, handle edge cases, enforce business rules.

### Acceptance Criteria

#### 1. Patch Comparison Logic (Only Changed Fields)

**Implement `processPatchProperty()` Helper:**
```javascript
/**
 * Process patch property - only include if changed
 * Matches production: PatchBuilder.cs ProcessPatchProperty<T>
 *
 * @param {*} nmdValue - Value from NMD message
 * @param {*} existingValue - Value from existing document
 * @returns {*} nmdValue if changed, null if unchanged or null
 */
function processPatchProperty(nmdValue, existingValue) {
    // Don't include nulls or undefined
    if (nmdValue === null || nmdValue === undefined) {
        return null;
    }

    // Only include if value has changed
    if (nmdValue === existingValue) {
        return null;  // No change
    }

    return nmdValue;  // Value changed, include it
}
```

**Update `buildPatchRequest()` to use comparison:**
- Apply `processPatchProperty()` to all simple fields (Name, State, OfficialVersion, etc.)
- Always include DocumentId, CabinetId (required)
- Always include ModNums if present
- Remove null values before sending
- Log changed fields count

**Console Logging for Changed Fields:**
```javascript
const changedFields = Object.keys(patchRequest).filter(k => k !== 'DocumentId' && k !== 'CabinetId');
console.log(`📝 Patch Request Built:`);
console.log(`   Changed Fields (${changedFields.length}): ${changedFields.join(', ')}`);
console.log(`   Payload Size: ${JSON.stringify(patchRequest).length} bytes`);
```

**Test scenarios (folder: "05 - Comparison Logic Tests"):**
- Test 1: No Changes (Minimal Patch) - Only DocumentId, CabinetId, ModNums sent
- Test 2: Single Field Change - Only changed field + required fields
- Test 3: Multiple Field Changes - Only changed fields included

#### 2. Custom Attributes Delta Calculation

**Implement `processCustomAttributes()` with Delta Logic:**
```javascript
/**
 * Process custom attributes - calculate add/update/delete delta
 * Matches production: CustomAttributesBuilder.cs Build()
 *
 * @param {Array} nmdAttributes - Custom attributes from NMD message
 * @param {Array} existingAttributes - Custom attributes from existing document
 * @returns {Array|null} Delta array or null if no changes
 */
function processCustomAttributes(nmdAttributes, existingAttributes) {
    // If no changes, return null
    if ((!nmdAttributes || nmdAttributes.length === 0) &&
        (!existingAttributes || existingAttributes.length === 0)) {
        return null;
    }

    // If no existing attributes, all NMD attributes are new
    if (!existingAttributes || existingAttributes.length === 0) {
        return nmdAttributes.length > 0 ? nmdAttributes : null;
    }

    // If no NMD attributes but existing attributes exist, mark all as deleted
    if (!nmdAttributes || nmdAttributes.length === 0) {
        return existingAttributes.map(attr => ({
            Key: attr.Key,
            IsDeleted: true
        }));
    }

    // Build comparison maps
    const nmdMap = new Map(nmdAttributes.map(a => [a.Key, a.Values]));
    const existingMap = new Map(existingAttributes.map(a => [a.Key, a.Values]));
    const result = [];

    // Find added or updated attributes
    for (const [key, values] of nmdMap) {
        const existingValues = existingMap.get(key);
        if (!existingValues) {
            // New attribute
            result.push({ Key: key, Values: values, IsDeleted: false });
        } else if (!arraysEqual(values, existingValues)) {
            // Updated attribute
            result.push({ Key: key, Values: values, IsDeleted: false });
        }
    }

    // Find deleted attributes
    for (const [key, values] of existingMap) {
        if (!nmdMap.has(key)) {
            result.push({ Key: key, IsDeleted: true });
        }
    }

    return result.length > 0 ? result : null;
}
```

**Console Logging for Custom Attributes Delta:**
```javascript
const delta = processCustomAttributes(nmdAttributes, existingAttributes);
if (delta === null) {
    console.log(`   Custom Attributes: No changes`);
} else {
    const added = delta.filter(a => !a.IsDeleted && !existingMap.has(a.Key)).length;
    const updated = delta.filter(a => !a.IsDeleted && existingMap.has(a.Key)).length;
    const deleted = delta.filter(a => a.IsDeleted).length;
    console.log(`   Custom Attributes Delta:`);
    if (added > 0) console.log(`      ➕ Added: ${added}`);
    if (updated > 0) console.log(`      ✏️  Updated: ${updated}`);
    if (deleted > 0) console.log(`      ❌ Deleted: ${deleted}`);
}
```

**Test scenarios (continued in "05 - Comparison Logic Tests"):**
- Test 4: Custom Attributes - Add
- Test 5: Custom Attributes - Update
- Test 6: Custom Attributes - Delete
- Test 7: Custom Attributes - Mixed Operations
- Test 8: Custom Attributes - No Changes

#### 3. Transformation Library

**Create folder: "04 - Transformation Library"**

Reusable transformation functions as dummy requests (no HTTP calls):
- `processPatchProperty` - Comparison logic for primitive types
- `processCustomAttributes` - Delta calculation for custom attributes
- `arraysEqual` - Array comparison helper
- `processVersions` - Version comparison
- `processAcl` - ACL comparison
- `processLinkedDocuments` - Linked docs comparison
- `processCheckedOutInfo` - Checked-out status comparison
- `processLockedInfo` - Lock status comparison

Each function has JSDoc documentation and can be copied to any request pre-request script.

#### 4. Multi-Version Support

**Update `buildVersionsList()` to handle:**
- Multiple versions (loop through all versions in NMD message)
- Version parent relationships: `verProps.parent`
- Version state: `verProps.deleted ? 'DELETED' : 'ACTIVE'`
- All version metadata fields

**Update `processVersions()` comparison function:**
```javascript
/**
 * Process versions - compare and detect changes
 * Returns null if versions unchanged, otherwise returns updated versions list
 */
function processVersions(nmdVersions, existingVersions) {
    const nmdVersionsList = buildVersionsList(nmdVersions);

    // If no existing versions, all are new
    if (!existingVersions || existingVersions.length === 0) {
        return nmdVersionsList;
    }

    // Compare version lists
    if (versionsEqual(nmdVersionsList, existingVersions)) {
        return null;  // No changes
    }

    return nmdVersionsList;
}

function versionsEqual(versions1, versions2) {
    if (versions1.length !== versions2.length) return false;

    // Compare each version
    for (let i = 0; i < versions1.length; i++) {
        const v1 = versions1[i];
        const v2 = versions2.find(v => v.VersionId === v1.VersionId);

        if (!v2) return false;  // Version ID not found

        // Compare key fields
        if (v1.State !== v2.State) return false;
        if (v1.Label !== v2.Label) return false;
        if (v1.Size !== v2.Size) return false;
        if (v1.Locked !== v2.Locked) return false;
    }

    return true;
}
```

**Test scenarios (folder: "06 - Multi-Version Tests"):**
- Test: Sync document with 3 versions
- Test: Add new version (v4) to existing 3-version document
- Test: Delete version (mark state=DELETED)
- Test: Update version metadata (lock v2)
- Test: Version parent relationships preserved

#### 5. First-Time Sync Detection (Production Logic)

**Implement `hasBeenSyncedBefore()`:**
```javascript
/**
 * Check if document has been synced before
 * Matches production: FirstTimeSyncingChecker.cs HasBeenSyncedBefore()
 *
 * Document is considered synced if it has ALL THREE:
 * - DocumentId (not null/empty)
 * - CabinetId (not null/empty)
 * - EnvUrl (not null/empty)
 *
 * @param {Object} extendedDocument - Extended document from metadata API
 * @returns {boolean} true if fully synced before, false if first-time
 */
function hasBeenSyncedBefore(extendedDocument) {
    if (!extendedDocument) {
        return false;  // No document = never synced
    }

    const hasDocumentId = extendedDocument.DocumentId &&
                          extendedDocument.DocumentId.trim().length > 0;
    const hasCabinetId = extendedDocument.CabinetId &&
                         extendedDocument.CabinetId.trim().length > 0;
    const hasEnvUrl = extendedDocument.EnvUrl &&
                      extendedDocument.EnvUrl.trim().length > 0;

    return hasDocumentId && hasCabinetId && hasEnvUrl;
}
```

**Update "Step 1: Check Document Existence" in both scenarios:**
```javascript
// Post-response script
const responseCode = pm.response.code;

let isNewDocument = false;
let existingDocument = null;

if (responseCode === 200) {
    existingDocument = pm.response.json();

    // Production logic: check if fully synced
    isNewDocument = !hasBeenSyncedBefore(existingDocument);

    if (isNewDocument) {
        console.log('⚠️  Document exists but incomplete - triggering first-time sync');
        console.log(`   Missing fields: ${getMissingFields(existingDocument).join(', ')}`);
    } else {
        console.log('✅ Document fully synced - update mode');
    }

} else if (responseCode === 404) {
    isNewDocument = true;
    console.log('✅ Document not found - first-time sync');
}

pm.environment.set('isNewDocument', isNewDocument.toString());
pm.environment.set('existingDocument', existingDocument ? JSON.stringify(existingDocument) : '');

function getMissingFields(doc) {
    const missing = [];
    if (!doc.DocumentId || doc.DocumentId.trim() === '') missing.push('DocumentId');
    if (!doc.CabinetId || doc.CabinetId.trim() === '') missing.push('CabinetId');
    if (!doc.EnvUrl || doc.EnvUrl.trim() === '') missing.push('EnvUrl');
    return missing;
}
```

#### 6. Content Discovery Workflow

**Create folder: "07 - Discovery Workflow (Conditional)"**

**Pre-folder script (skip if not first-time sync):**
```javascript
const isNewDocument = pm.environment.get('isNewDocument') === 'true';

if (!isNewDocument) {
    console.log('⏭️  Skipping discovery - not first-time sync');
    // Postman doesn't support skipping folders, so each request checks this
}
```

**Request 1: Get Document Attachments**
```
GET {{contentBaseUrl}}/v1/content/{{documentId}}/attachments
Authorization: Bearer {{contentToken}}

Pre-request Script:
if (pm.environment.get('isNewDocument') !== 'true') {
    return;  // Skip if not new document
}

Tests:
const isNewDocument = pm.environment.get('isNewDocument') === 'true';
if (!isNewDocument) {
    pm.test.skip('Skipped - not first-time sync');
    return;
}

pm.test('Status code is 200', () => {
    pm.response.to.have.status(200);
});

const response = pm.response.json();
const attachments = response.items || [];
pm.environment.set('documentAttachments', JSON.stringify(attachments));

console.log(`📎 Document-level attachments found: ${attachments.length}`);
```

**Request 2: Get Version Attachments (per version)**
```
GET {{contentBaseUrl}}/v1/content/{{documentId}}/versions/1/attachments
Authorization: Bearer {{contentToken}}

Pre-request Script:
if (pm.environment.get('isNewDocument') !== 'true') {
    return;
}

// Get version count from nmdMessage
const nmdMessage = JSON.parse(pm.environment.get('nmdMessage'));
const versions = Object.keys(nmdMessage.documents['1'].versions);
const currentVersionIndex = 0;  // Start with first version

pm.environment.set('currentVersionId', versions[currentVersionIndex]);
pm.environment.set('versionCount', versions.length.toString());
pm.environment.set('currentVersionIndex', '0');

Tests:
// Loop through all versions (in real implementation, use collection runner)
const response = pm.response.json();
const attachments = response.items || [];

console.log(`📎 Version 1 attachments found: ${attachments.length}`);

// Store per-version attachments
const allVersionAttachments = JSON.parse(pm.environment.get('versionAttachments') || '{}');
allVersionAttachments['1'] = attachments;
pm.environment.set('versionAttachments', JSON.stringify(allVersionAttachments));
```

**Request 3: Get Snapshots (per version)**
```
GET {{contentBaseUrl}}/v1/content/{{documentId}}/versions/1/snapshots
Authorization: Bearer {{contentToken}}

Pre-request Script:
if (pm.environment.get('isNewDocument') !== 'true') {
    return;
}

Tests:
const response = pm.response.json();
const snapshots = response.items || [];

console.log(`📸 Version 1 snapshots found: ${snapshots.length}`);

// Store per-version snapshots
const allVersionSnapshots = JSON.parse(pm.environment.get('versionSnapshots') || '{}');
allVersionSnapshots['1'] = snapshots;
pm.environment.set('versionSnapshots', JSON.stringify(allVersionSnapshots));
```

**Request 4: Discovery Summary**
```
GET {{metadataBaseUrl}}/ping  (dummy request)

Pre-request Script:
const isNewDocument = pm.environment.get('isNewDocument') === 'true';

if (isNewDocument) {
    console.log('');
    console.log('🔍 DISCOVERY WORKFLOW COMPLETE');
    console.log('================================');

    const docAttachments = JSON.parse(pm.environment.get('documentAttachments') || '[]');
    console.log(`📎 Document-level attachments: ${docAttachments.length}`);

    const versionAttachments = JSON.parse(pm.environment.get('versionAttachments') || '{}');
    const totalVersionAttachments = Object.values(versionAttachments)
        .reduce((sum, arr) => sum + arr.length, 0);
    console.log(`📎 Version-level attachments: ${totalVersionAttachments}`);

    const versionSnapshots = JSON.parse(pm.environment.get('versionSnapshots') || '{}');
    const totalSnapshots = Object.values(versionSnapshots)
        .reduce((sum, arr) => sum + arr.length, 0);
    console.log(`📸 Snapshots: ${totalSnapshots}`);

    console.log('');
} else {
    console.log('⏭️  Discovery skipped - not first-time sync');
}
```

#### 7. Complex Document Support

**A. Document States (ARCHIVED, DELETED)**

Update `calculateDocumentState()` (already shown in Story 1)

**Test scenarios (folder: "08 - Document State Tests"):**
- Test: Archive active document (status |= 1)
- Test: Delete active document (deleted = true)
- Test: Cannot revert to PENDING (existing ACTIVE, calculated PENDING → keep ACTIVE)

**B. Locked and Checked-Out Status**

Update `buildCheckedOutInfo()` and `buildLockedInfo()` (implementations in plan)

**Test scenarios (folder: "09 - Lock & Checkout Tests"):**
- Test: Check out document
- Test: Lock document
- Test: Collaboration edit active
- Test: Release checkout/lock

**C. Folder Tree and Hierarchy**

Update `buildPatchRequest()` to parse folder tree (pipe-delimited)

**Test scenarios (folder: "10 - Folder Hierarchy Tests"):**
- Test: Simple folder path
- Test: Nested folders (3+ levels)
- Test: Root-level document (no folders)

**D. DLP Policies**

Update `buildDlpInfo()` (implementation in plan)

**Test scenarios (folder: "11 - DLP Tests"):**
- Test: Document with DLP policy
- Test: Document with classification
- Test: Document without DLP

**E. Email Properties**

Implement `parseEmailProperties()` and `parseEmailAttachments()`

**Test scenarios (folder: "12 - Email Tests"):**
- Test: Email document with properties
- Test: Email with 2+ attachments
- Test: Non-email document

**F. Linked Documents**

Update `buildLinkedDocuments()` (implementation in plan)

**Test scenarios (folder: "13 - Linked Documents Tests"):**
- Test: Document with 3 linked documents
- Test: Document without links

**G. Alerts and Approvals**

Implement `parseAlerts()` and `parseApproval()`

**Test scenarios (folder: "14 - Alerts & Approvals Tests"):**
- Test: Document with 2+ alerts
- Test: Document with pending approval
- Test: Document without alerts/approval

**H. WOPI Integration Support** 🆕

Implement WOPI-specific field parsing for Office 365 collaboration:

```javascript
function parseWopiInfo(verProps) {
    return {
        WopiLock: verProps.wopiLock || null,
        WopiLockExpiration: verProps.wopiLockExpiration ?
            convertNetDocumentsDate(verProps.wopiLockExpiration) : null,
        ContentTag: verProps.contentTag || null
    };
}
```

Update `buildVersionsList()` to include WOPI fields in version metadata.

**Test scenarios (folder: "15 - WOPI Tests"):** 🆕
- Test: WOPI test document (wopitest extension)
- Test: Document with active WOPI lock
- Test: WOPI lock expiration parsing
- Test: CollabEditType "Wopi CSPP"
- Test: ContentTag field

**I. Digital Signatures Parsing** 🆕

Implement signature extraction from document properties:

```javascript
function parseSignatures(docProps) {
    const signatures = [];

    // Find all signature| keys
    for (const [key, value] of Object.entries(docProps)) {
        if (key.startsWith('signature|')) {
            // Format: signature|<verNo>|<guid>
            const parts = key.split('|');
            if (parts.length === 3) {
                signatures.push({
                    VersionNo: parseInt(parts[1]),
                    SignatureId: parts[2],
                    TimeStamp: convertNetDocumentsDate(value.timeStamp),
                    SignatureType: value.sigType,
                    Signer: value.signer,
                    SignerGuid: value.signerGuid,
                    SignatureData: value.sigData
                });
            }
        }
    }

    return signatures.length > 0 ? signatures : null;
}
```

**Test scenarios (folder: "16 - Signature Tests"):** 🆕
- Test: Document with digital signature
- Test: Multiple signatures on same document
- Test: Signature timestamp parsing
- Test: Signature verification data structure

**J. Index Locations** 🆕

Implement index location parsing (found in 217+ documents):

```javascript
function parseIndexLocations(docProps) {
    const indexes = {};

    if (docProps['indexType-Metadata']) {
        indexes.Metadata = {
            Type: docProps['indexType-Metadata'],
            Location: docProps['indexLocation-Metadata']
        };
    }

    if (docProps['indexType-FullText']) {
        indexes.FullText = {
            Type: docProps['indexType-FullText'],
            Location: docProps['indexLocation-FullText']
        };
    }

    if (docProps['indexType-Entities']) {
        indexes.Entities = {
            Type: docProps['indexType-Entities'],
            Location: docProps['indexLocation-Entities']
        };
    }

    return Object.keys(indexes).length > 0 ? indexes : null;
}
```

**Test scenarios (folder: "17 - Index Location Tests"):** 🆕
- Test: Document with Metadata index (COUCHBASE)
- Test: Document with FullText index
- Test: Document with Entities index
- Test: Document with all three index types

#### 8. Comprehensive Test Scenarios (UPDATED)

**Create folder: "18 - End-to-End Test Scenarios"**

16 complete scenarios testing all features (updated from 12):
1. **Simple Document Create & Update** (POC equivalent)
2. **Multi-Version Document** (3 versions)
3. **First-Time Sync with Discovery** (incomplete document)
4. **Document with DLP Policy**
5. **Document with Custom Attributes** (add/update/delete)
6. **Document in Folder Hierarchy**
7. **Folder Document** (.ndfld extension) 🆕
8. **Archive Document** (ACTIVE → ARCHIVED)
9. **Delete Document** (ACTIVE → DELETED)
10. **Lock Document**
11. **Check Out Document**
12. **WOPI Collaboration Document** (wopitest, wopiLock) 🆕
13. **Document with Digital Signature** 🆕
14. **Document with Index Locations** (Metadata, FullText, Entities) 🆕
15. **Email Document with Attachments**
16. **Complex Document** (all features: multi-version, DLP, custom attrs, folders, links, signature, indexes)

Each scenario:
- Loads appropriate sample
- Runs complete workflow (check → content root → build → patch)
- Includes discovery if first-time sync
- Validates results
- Console logs scenario progress

#### 9. Supporting API Calls

**Create folder: "19 - Supporting API Calls"** (renumbered)

Utility requests for manual operations:
- Get Document by ID (extended)
- Get Document by ID (basic)
- Delete Document by ID
- Get Cabinet Info
- Get User Info
- List Attachments (document-level)
- List Attachments (version-level)
- List Snapshots
- Get ACL for Document

**Note:** Section 3 created the basic transformation library with comparison functions. This section is implicit - all complex transformations are added as part of section 7 (Complex Document Support).

#### 10. Documentation (UPDATED)

**Create "00 - Setup & Documentation" folder with READMEs:**
- Collection Overview
- Quick Start Guide
- Environment Setup
- Token Management
- Sample Message Library (14 samples)
- Transformation Logic Reference
- API Call Sequence
- Test Scenarios Guide
- Troubleshooting
- Known Limitations (Kafka, etc.)

**Create documentation files in repo:**
- **README.md** - Repository overview, import instructions
- **USAGE-GUIDE.md** - Detailed usage instructions
- **TRANSFORMATION-LOGIC.md** - All transformation functions documented with C# references
- **SAMPLES-REFERENCE.md** - All 14 samples documented with field explanations
- **CHANGELOG.md** - Version history

#### 11. Export and Distribution

**Export files for each environment:**
- `doc-ndserver-sync-wrk.postman_collection.json` (main collection)
- `doc-ndserver-sync-wrk-DEV.postman_environment.json`
- `doc-ndserver-sync-wrk-QA.postman_environment.json`
- `doc-ndserver-sync-wrk-UAT.postman_environment.json`

**Remove sensitive data:**
- Tokens set to empty strings with placeholder text
- No hardcoded credentials
- Comments explaining how to obtain tokens

### Definition of Done (UPDATED)
- [ ] All 18 sample NMD messages created and stored in environment (up from 14) 🆕
- [ ] All samples have "Load Sample" requests
- [ ] Multi-version support implemented and tested (3+ versions)
- [ ] First-time sync detection uses 3-field check (DocumentId + CabinetId + EnvUrl)
- [ ] Discovery workflow implemented (document attachments, version attachments, snapshots)
- [ ] Discovery workflow runs conditionally (only if `isNewDocument = true`)
- [ ] All document states handled (PENDING, ACTIVE, ARCHIVED, DELETED)
- [ ] State immutability enforced (cannot revert to PENDING)
- [ ] Locked status parsing complete
- [ ] Checked-out status parsing complete
- [ ] **WOPI fields parsing complete (wopiLock, wopiLockExpiration, contentTag)** 🆕
- [ ] **Digital signature extraction complete (signature| keys)** 🆕
- [ ] **Index locations parsing complete (Metadata, FullText, Entities)** 🆕
- [ ] Folder tree parsing complete
- [ ] Folder documents (.ndfld) handling complete 🆕
- [ ] DLP policy extraction complete
- [ ] Email properties parsing complete
- [ ] Linked documents parsing complete
- [ ] Alerts parsing complete
- [ ] Approval parsing complete
- [ ] 16 end-to-end test scenarios created and passing (up from 12) 🆕
- [ ] Supporting API calls folder created (10 requests)
- [ ] Transformation library complete (20+ functions, up from 16) 🆕
- [ ] Documentation folder created (10 README requests)
- [ ] Repository documentation files created (README, USAGE-GUIDE, TRANSFORMATION-LOGIC, SAMPLES-REFERENCE, CHANGELOG)
- [ ] **SAMPLES-REFERENCE.md includes production statistics from 10,000 message analysis** 🆕
- [ ] Collection exported for DEV, QA, UAT environments
- [ ] No sensitive data in exported files
- [ ] Newman CLI execution passes all tests
- [ ] All console logging clear and informative
- [ ] Collection replicates full production worker functionality including WOPI, signatures, and indexes 🆕

### Estimated Effort (UPDATED)
**52 hours** (was 48 hours, now includes patch comparison and delta calculation from old Story 2)

**Patch Comparison & Delta Logic** (moved from Story 2):
- Implement patch comparison logic: 3 hours
- Implement custom attributes delta: 3 hours
- Create comparison test scenarios (8 tests): 3 hours
- Update existing scenarios to use comparison: 1 hour

**Multi-Version & Discovery:**
- Multi-version support: 3 hours
- First-time sync detection: 2 hours
- Discovery workflow: 4 hours

**Complex Document Features** (leveraging samples from Story 2):
- Document states and lock/checkout: 3 hours (reduced from 4, samples already created)
- WOPI integration support: 1 hour (reduced from 2, samples in Story 2) 🆕
- Digital signatures parsing: 1 hour (reduced from 2, samples in Story 2) 🆕
- Index locations parsing: 1 hour (same) 🆕
- Folder tree, DLP, email, linked docs: 5 hours (reduced from 6)
- Alerts and approvals: 3 hours

**Testing & Documentation:**
- 16 end-to-end scenarios: 6 hours (reduced from 7, leveraging Story 2 samples) 🆕
- Supporting API calls: 2 hours
- Transformation library expansion: 2 hours (reduced from 4, basics created earlier)
- Documentation (in-collection + files): 4 hours (reduced from 5, building on Story 2 docs) 🆕
- Testing and validation: 3 hours 🆕
- Export and distribution: 1 hour

**Total: 52 hours**
- Story 2 samples eliminate ~5 hours of duplicate work
- Story 2 basic transformation library saves ~2 hours
- Adding patch comparison/delta adds +12 hours from old Story 2

---

## Implementation Roadmap

### Total Effort Summary (UPDATED)
| User Story | Priority | Effort | Status |
|------------|----------|--------|--------|
| Story 1: POC Two-Scenario Workflow | HIGHEST | 8 hours | ✅ COMPLETED |
| Story 2: Basic Document Types & File Extensions | HIGH | 4 hours (was 6) | 🔲 Not Started (samples ✅ DONE) |
| Story 3: Advanced Document Features & Metadata | HIGH | 7 hours (was 10) | 🔲 Not Started (samples ✅ DONE) |
| Story 4: Add Production Complexity | MEDIUM | 52 hours | 🔲 Not Started |
| **TOTAL** | | **71 hours** (was 76) | **11% Complete** |

**Sample Creation:** ✅ DONE (5 hours saved)
- All 18 samples created in `samples/` directory
- Complete documentation in samples/README.md and SAMPLE_MANIFEST.txt
- All samples validated with correct IDs and structure

**Restructured Stories (4 total):**
- **Story 1:** POC foundation ✅ DONE
- **Story 2 (NEW):** Basic file types (7 samples: txt, docx, pdf, ndfld, wopitest, eml, archived) - EASY, no new extraction
- **Story 3 (NEW):** Advanced metadata (11 samples: custom attrs, signatures, indexes, WOPI, versions, ACLs, snapshots) - Adds extraction functions
- **Story 4:** Complex optimization - patch comparison, delta calculation, multi-version, discovery, all advanced features
- **Key benefit:** Logical domain separation - file types (Story 2), then metadata (Story 3), then optimization (Story 4)

### Recommended Implementation Order

**Sprint 1 (Week 1): Basic Document Types**
- Implement User Story 2: Add 6 new samples (7 total with POC)
- Focus: Validate POC works with all major file types
- Deliverable: Collection works with txt, docx, pdf, ndfld, wopitest, eml, archived
- **Very easy sprint** - zero transformation logic changes, just test POC with different extensions
- **Complete value:** 93% of production file types covered

**Sprint 2 (Week 2): Advanced Metadata**
- Implement User Story 3: Add 11 advanced metadata samples
- Focus: Add extraction for signatures, indexes, WOPI - still using POC transformation
- Deliverable: Collection extracts all complex metadata patterns (WOPI, signatures, indexes, custom attrs, versions, ACLs)
- **Moderate sprint** - 3 new extraction functions, still full document state
- **Complete value:** 100% of production metadata patterns covered

**Sprint 3 (Week 3-4): Production Optimization**
- Implement Story 4 sections 1-3: Patch comparison, delta calculation, transformation library
- Focus: Match production payloads (only changed fields, delta operations)
- Deliverable: Collection sends optimized payloads like production worker

**Sprint 4 (Week 5-6): Multi-Version and Discovery**
- Implement Story 4 sections 4-6: Multi-version, first-time sync, discovery
- Focus: Handle complex version histories and content discovery
- Deliverable: Collection handles multi-version documents correctly

**Sprint 5 (Week 7-8): Complex Documents**
- Implement Story 4 section 7: All complex document features
- Focus: DLP, email, folders, alerts, approvals
- Deliverable: Collection handles all production document complexities

**Sprint 6 (Week 9-10): Testing and Documentation**
- Implement Story 4 sections 8-11: Test scenarios, supporting APIs, docs, export
- Focus: End-to-end testing, comprehensive documentation
- Deliverable: Production-ready collection with full documentation

### Success Criteria (UPDATED)

**Collection is production-ready when:**
- ✅ **Story 1:** POC implemented and working (DONE)
- [ ] **Story 2:** All 7 basic file type samples tested (93% coverage)
- [ ] **Story 3:** All 11 advanced metadata samples tested with extraction (100% coverage)
- [ ] **Story 3:** WOPI, signature, and index field extraction working
- [ ] **Story 4:** Patch comparison matches production (only changed fields sent)
- [ ] Custom attributes delta calculation matches production
- [ ] All 18 document types supported with samples (up from 14) 🆕
- [ ] Multi-version documents handled correctly
- [ ] First-time sync detection uses 3-field check
- [ ] Discovery workflow runs conditionally
- [ ] All document states and transitions supported
- [ ] **WOPI collaboration features fully supported** 🆕
- [ ] **Digital signatures correctly parsed and stored** 🆕
- [ ] **Index locations (Metadata/FullText/Entities) handled** 🆕
- [ ] **Folder documents (.ndfld) processed correctly** 🆕
- [ ] 16 end-to-end scenarios pass (up from 12) 🆕
- [ ] Comprehensive documentation complete
- [ ] Collection can be distributed to team
- [ ] Newman CLI execution passes all tests
- [ ] Zero gaps between collection and production worker behavior
- [ ] **Collection validated against real production data (10,000 messages)** 🆕

---

**END OF USER STORIES**
