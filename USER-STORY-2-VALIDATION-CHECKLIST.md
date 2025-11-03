# User Story 2 - Validation Checklist

**Implementation Date:** 2025-11-03  
**Branch:** `407304-update-poc`  
**Status:** Ready for Testing

---

## Pre-Testing Validation

### File Integrity

- [x] Environment file JSON syntax valid
- [x] Collection file JSON syntax valid
- [x] All 6 new samples embedded in environment
- [x] All 6 new Load Sample requests created
- [x] All 6 test scenario folders created
- [x] Supporting API Calls folder created
- [x] Documentation files created

### Environment Variables Check

Verify these environment variables exist in `doc-ndserver-sync-wrk-POC.postman_environment.json`:

- [x] `sample_simple_document` (existing - POC baseline)
- [x] `sample_docx_document` (new)
- [x] `sample_pdf_document` (new)
- [x] `sample_folder_document` (new)
- [x] `sample_wopi_test` (new)
- [x] `sample_email` (new)
- [x] `sample_archived` (new)

### Collection Structure Check

Verify these folders exist in `doc-ndserver-sync-wrk-POC.postman_collection.json`:

- [x] `01 - Load Sample Document` (7 requests total: 1 existing + 6 new)
- [x] `05 - Test Scenario: DOCX Document`
- [x] `06 - Test Scenario: PDF Document`
- [x] `07 - Test Scenario: Folder Document`
- [x] `08 - Test Scenario: WOPI Test File`
- [x] `09 - Test Scenario: Email Document`
- [x] `10 - Test Scenario: Archived Document`
- [x] `99 - Supporting API Calls`

---

## Manual Testing in Postman

### Test 1: Load Sample Requests

**Test each "Load Sample" request individually:**

1. [ ] Load Sample: Simple Document (existing POC baseline)
   - Console shows: "LOADED SAMPLE: Simple Document"
   - Extension: txt
   - Dynamic document ID generated
   - nmdMessage variable set

2. [ ] Load Sample: DOCX Document
   - Console shows: "LOADED SAMPLE: DOCX Document"
   - Extension: docx
   - Coverage: 25% of production
   - Dynamic document ID generated

3. [ ] Load Sample: PDF Document
   - Console shows: "LOADED SAMPLE: PDF Document"
   - Extension: pdf
   - Dynamic document ID generated

4. [ ] Load Sample: Folder Container
   - Console shows: "LOADED SAMPLE: Folder Container"
   - Extension: ndfld
   - Note about folder container displayed

5. [ ] Load Sample: WOPI Test File
   - Console shows: "LOADED SAMPLE: WOPI Test File"
   - Extension: wopitest
   - Coverage: 12% of production
   - Note about Office 365 integration

6. [ ] Load Sample: Email Message
   - Console shows: "LOADED SAMPLE: Email Message"
   - Extension: eml
   - Coverage: 3% of production
   - Note about emailProps metadata

7. [ ] Load Sample: Archived Document
   - Console shows: "LOADED SAMPLE: Archived Document"
   - Extension: txt
   - Status: 1 (Archived flag)
   - Note about status flag handling

### Test 2: Run Complete Test Scenario (Example: DOCX)

**Run folder:** `05 - Test Scenario: DOCX Document`

**Expected workflow:**

1. [ ] Step 1: Load DOCX Sample
   - Sample loaded successfully
   - Dynamic document ID generated
   - Console shows test scenario header

2. [ ] Upload Initial Content (4 requests)
   - [ ] Extract Content Metadata
     - Filename extracted
     - Extension: docx
     - User ID extracted
   - [ ] Create Snapshot & Get Presigned URL
     - Status: 201 Created
     - Presigned URL received
   - [ ] Upload Content to S3
     - Status: 200 OK
     - Content uploaded successfully
   - [ ] Verify Snapshot Exists
     - Status: 200 OK
     - Snapshot found in list

3. [ ] SCENARIO 1 - CREATE (4 requests)
   - [ ] Check Document Existence
     - Status: 404 Not Found (expected)
     - isNewDocument = true
   - [ ] Configure Content Root
     - Status: 204 No Content
   - [ ] Build CREATE Patch Request
     - Patch request built successfully
     - Console shows transformed data
   - [ ] CREATE Document
     - Status: 200 OK
     - Document created successfully

4. [ ] SCENARIO 2 - UPDATE (4 requests)
   - [ ] Check Document Existence
     - Status: 200 OK (document now exists)
     - isNewDocument = false
   - [ ] Update Content Root
     - Status: 204 No Content
   - [ ] Build UPDATE Patch Request
     - Name updated with "[UPDATED]" suffix
     - Timestamps updated
   - [ ] UPDATE Document
     - Status: 200 OK
     - Document updated successfully

5. [ ] Validation (5 requests)
   - [ ] Validate Document Metadata
     - All tests pass (green)
     - Document ID matches
     - State is ACTIVE
     - Name contains "[UPDATED]"
   - [ ] Validate Versions
     - All tests pass (green)
     - Version 1 exists
     - Extension is docx
   - [ ] Validate ACL
     - All tests pass (green)
     - 2 ACL entries
     - VESD relations correct
   - [ ] Validate ModNums
     - All tests pass (green)
     - DocModNum incremented
   - [ ] Validation Summary
     - Comprehensive summary logged
     - All validations successful

### Test 3: Run All 6 New Scenarios

Repeat Test 2 for each document type:

- [ ] `05 - Test Scenario: DOCX Document`
- [ ] `06 - Test Scenario: PDF Document`
- [ ] `07 - Test Scenario: Folder Document`
- [ ] `08 - Test Scenario: WOPI Test File`
- [ ] `09 - Test Scenario: Email Document`
- [ ] `10 - Test Scenario: Archived Document`

**Expected:** All scenarios complete successfully with all tests passing.

### Test 4: Supporting API Calls

**Test utility requests in folder `99 - Supporting API Calls`:**

1. [ ] Get Document by ID (Extended)
   - Set documentId in environment
   - Run request
   - Status: 200 OK (if document exists)
   - Console shows complete metadata

2. [ ] Get Document by ID (Basic)
   - Run request
   - Status: 200 OK
   - Console shows basic metadata only

3. [ ] Get Cabinet Info
   - Set cabinetId in environment (e.g., NG-8RZI6EOH)
   - Run request
   - Status: 200 OK
   - Console shows cabinet info

4. [ ] Delete Document by ID (Optional - cleanup)
   - Use only for test cleanup
   - Run request
   - Status: 204 or 200
   - Document removed

---

## Newman CLI Testing

### Prerequisites

```bash
cd /Users/alexwar/Documents/GitHub/NetDocuments/doc-ndserver-sync-wrk-postman-collection

# Ensure Newman is installed
npm install
```

### Test 1: Validate Collection Syntax

```bash
# Validate collection file
./node_modules/.bin/newman run doc-ndserver-sync-wrk-POC.postman_collection.json \
  -e doc-ndserver-sync-wrk-POC.postman_environment.json \
  --bail
```

**Expected:**
- [ ] No syntax errors
- [ ] Collection loads successfully
- [ ] Environment loads successfully

### Test 2: Run Single Scenario

```bash
# Run DOCX scenario
./node_modules/.bin/newman run doc-ndserver-sync-wrk-POC.postman_collection.json \
  -e doc-ndserver-sync-wrk-POC.postman_environment.json \
  --folder "05 - Test Scenario: DOCX Document" \
  --reporters cli,json \
  --reporter-json-export results-docx.json
```

**Expected:**
- [ ] All requests execute successfully
- [ ] All tests pass
- [ ] No errors in console output
- [ ] Results JSON generated

### Test 3: Run All Test Scenarios

```bash
# Run all scenarios sequentially
./node_modules/.bin/newman run doc-ndserver-sync-wrk-POC.postman_collection.json \
  -e doc-ndserver-sync-wrk-POC.postman_environment.json \
  --folder "05 - Test Scenario: DOCX Document" \
  --folder "06 - Test Scenario: PDF Document" \
  --folder "07 - Test Scenario: Folder Document" \
  --folder "08 - Test Scenario: WOPI Test File" \
  --folder "09 - Test Scenario: Email Document" \
  --folder "10 - Test Scenario: Archived Document" \
  --reporters cli,json \
  --reporter-json-export results-all.json
```

**Expected:**
- [ ] All 6 scenarios execute
- [ ] All tests pass across all scenarios
- [ ] No errors
- [ ] Complete results JSON generated

### Test 4: Full Collection Run

```bash
# Run entire collection (including original POC)
./node_modules/.bin/newman run doc-ndserver-sync-wrk-POC.postman_collection.json \
  -e doc-ndserver-sync-wrk-POC.postman_environment.json \
  --reporters cli,htmlextra \
  --reporter-htmlextra-export newman-report.html
```

**Expected:**
- [ ] All folders execute
- [ ] Original POC scenarios pass
- [ ] All 6 new scenarios pass
- [ ] HTML report generated
- [ ] Overall pass rate: 100%

---

## Validation Metrics

### Coverage Validation

**File Type Coverage:**
- [ ] txt: 45% (baseline POC + archived)
- [ ] docx: 25% (new)
- [ ] wopitest: 12% (new)
- [ ] ndfld: 8% (new)
- [ ] eml: 3% (new)
- [ ] pdf: <1% (new)
- **Total: 93% of production file types**

### Transformation Validation

**Verify no transformation changes needed:**
- [ ] Extension field extracted naturally
- [ ] Status flags handled by existing logic
- [ ] No new metadata parsing required
- [ ] Same API call sequence for all types

### Performance Validation

**Measure execution times:**
- [ ] Load Sample: < 1 second
- [ ] Upload Content: < 5 seconds
- [ ] CREATE Scenario: < 3 seconds
- [ ] UPDATE Scenario: < 3 seconds
- [ ] Validation: < 2 seconds
- **Total per scenario: < 15 seconds**

---

## Documentation Validation

### Files Created

- [ ] `SAMPLES-REFERENCE-PART1.md` exists
- [ ] POC-QUICKSTART.md updated with new section
- [ ] All sample files in `samples/` directory
- [ ] SAMPLE_MANIFEST.txt up to date

### Documentation Accuracy

- [ ] All 7 samples documented
- [ ] Production statistics accurate
- [ ] Usage instructions clear
- [ ] Examples correct
- [ ] Links work

---

## Acceptance Criteria (from User Story 2)

### Phase 1: Embed Samples
- [x] All 7 samples loadable from environment
- [x] Samples are valid JSON strings
- [x] No syntax errors in environment file

### Phase 2: Load Sample Requests
- [x] 7 "Load Sample" requests created
- [x] Each generates dynamic document ID
- [x] Console logging clear and informative
- [ ] All requests execute successfully (needs QA testing)

### Phase 3: Test Scenarios
- [x] 6 test scenario folders created (05-10)
- [x] Each includes complete workflow
- [ ] All scenarios execute successfully (needs QA testing)
- [ ] CREATE and UPDATE work for all types (needs QA testing)

### Phase 4: Supporting APIs
- [x] Folder 99 created with 4 requests
- [ ] All utility requests work (needs QA testing)

### Phase 5: Documentation
- [x] SAMPLES-REFERENCE-PART1.md created
- [x] POC-QUICKSTART.md updated
- [x] All samples documented

### Phase 6: Testing
- [x] Environment file JSON valid
- [x] Collection file JSON valid
- [ ] All scenarios tested manually (needs QA testing)
- [ ] Newman CLI execution succeeds (needs QA testing)
- [ ] 93% coverage achieved
- [ ] No transformation changes confirmed

---

## Sign-Off

### Implementation Complete

- [x] All code changes implemented
- [x] All documentation created
- [x] Git branch created and committed
- [x] No syntax errors
- [x] Ready for QA testing

### Pending QA Environment Testing

The following require access to QA environment with valid tokens:

- [ ] Manual testing in Postman
- [ ] Newman CLI execution
- [ ] API endpoint validation
- [ ] End-to-end scenario testing

### Recommendation

**Status:** Implementation complete and ready for QA testing.

**Next Steps:**
1. Merge branch `407304-update-poc` to main (after QA approval)
2. Import updated collection and environment into Postman
3. Obtain fresh tokens using TokenGenerator
4. Run manual tests in Postman
5. Run Newman CLI validation
6. Verify all 6 scenarios pass

**Expected Outcome:**
- 93% production file type coverage
- All scenarios pass without changes to transformation logic
- Foundation ready for User Story 3 (Advanced Metadata)

---

**Created:** 2025-11-03  
**Implementation:** Complete  
**QA Testing:** Pending (requires QA environment access)

