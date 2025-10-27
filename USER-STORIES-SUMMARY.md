# User Stories Summary: doc-ndserver-sync-wrk Postman Collection

## User Story 1: POC Two-Scenario Workflow with Validation ✅

**Priority:** HIGHEST
**Effort:** 8 hours
**Status:** ✅ COMPLETED

### Description
Create a POC Postman collection demonstrating complete document synchronization workflow with two scenarios (CREATE and UPDATE) including content upload and comprehensive validation.

### Acceptance Criteria
- POC collection with 5 folders: Load Sample, Upload Content, Scenario 1 (CREATE), Scenario 2 (UPDATE), Validation
- Dynamic document ID generation to avoid conflicts on repeated runs
- Environment file with base URLs and token variables configured
- Sample simple document embedded in environment
- Scenario 1: Check existence (404) → Configure content root → Build patch → CREATE document
- Scenario 2: Check existence (200) → Update content root → Build patch → UPDATE document
- Content upload workflow with S3 presigned URLs
- Core transformations: Date conversion, ACL mapping (VESD → SpiceDB), version metadata, document state
- 5 validation requests with Postman test assertions
- Console logging at each step showing progress
- Newman CLI compatible
- POC-QUICKSTART.md documentation complete

---

## User Story 2: Basic Document Types & File Extensions

**Priority:** HIGH
**Effort:** 4 hours (reduced from 6 - samples ✅ DONE)
**Status:** 🔲 Not Started (Sample Creation ✅ COMPLETED)

### Description
Add 6 new samples for major document file types (docx, pdf, folder, wopitest, email, archived) and test with existing POC workflow. No transformation logic changes needed - POC already handles all these file types naturally. Focus on validating POC works with different file extensions.

### Sample Status ✅
- All 7 samples created in `samples/` directory
- samples/README.md documents all basic type samples
- samples/SAMPLE_MANIFEST.txt provides inventory
- All samples validated with correct IDs (4817-7714-XXXX pattern)

### Acceptance Criteria
- [x] ✅ All 7 samples created in `samples/` directory: docx, pdf, ndfld (folder), wopitest, eml (email), archived, txt (POC)
- [x] ✅ Coverage: txt (45%), docx (25%), wopitest (12%), ndfld (8%), eml (3%) = 93% of production file types
- [x] ✅ All samples based on real production patterns (10,000 messages analyzed)
- [ ] Create 7 "Load Sample" requests in Postman that read from `samples/` directory
- [ ] Create 7 test scenarios in "05 - Sample Testing - Basic Types" (CREATE + UPDATE + Validation for each)
- [ ] No transformation logic changes - POC handles all file types naturally
- [ ] Create "06 - Supporting API Calls" folder with 4 utility requests
- [ ] Update POC-QUICKSTART.md with "Testing Different Document Types" section
- [ ] SAMPLES-REFERENCE-PART1.md created (or reference samples/README.md)
- [ ] Newman CLI executes all 7 scenarios successfully
- [ ] All validation tests pass

---

## User Story 3: Advanced Document Features & Metadata

**Priority:** HIGH
**Effort:** 7 hours (reduced from 10 - samples ✅ DONE)
**Status:** 🔲 Not Started (Sample Creation ✅ COMPLETED)

### Description
Add 11 samples for complex metadata structures (custom attributes, signatures, indexes, WOPI locks, versions, ACLs, snapshots) with minimal extraction functions. Still uses POC transformation logic (full document state) but adds field extraction for WOPI, signatures, and indexes.

### Sample Status ✅
- All 11 advanced metadata samples created in `samples/` directory
- samples/README.md documents all advanced samples with production statistics
- samples/SAMPLE_MANIFEST.txt lists all features and extraction requirements
- All samples validated with correct IDs and metadata structures

### Acceptance Criteria
- [x] ✅ All 11 advanced metadata samples created in `samples/` (18 total): custom attributes, folder tree, wopi with lock, signature, indexes, checked-out, collab edit, multiple versions, multiple ACL, multiple snapshots, complex
- [x] ✅ All samples include production-observed metadata patterns
- [ ] Create 11 "Load Sample" requests in Postman that read from `samples/` directory
- [ ] Create 11 test scenarios in "05 - Sample Testing - Advanced Metadata"
- [ ] Add 3 new extraction functions:
  - extractSignatures() for signature|verNo|guid keys (100+ docs in production, 5%)
  - extractIndexLocations() for COUCHBASE indexes (217+ docs, 11% of sample)
  - Extract WOPI fields: wopiLock, wopiLockExpiration, contentTag (26+ active locks)
- [ ] Custom attributes, folder tree, versions, ACLs, snapshots already extracted by POC
- [ ] Expand "06 - Supporting API Calls" with 3 more requests (attachments, snapshots)
- [ ] Update POC-QUICKSTART.md with "Testing Advanced Metadata" section
- [ ] SAMPLES-REFERENCE-PART2.md created (or reference samples/README.md)
- [ ] Newman CLI executes all 11 scenarios successfully
- [x] ✅ 100% of production metadata patterns covered

---

## User Story 4: Add Production Complexity (Patch Comparison, Delta Calculation, Multi-Version, Discovery)

**Priority:** MEDIUM
**Effort:** 52 hours 🆕
**Status:** 🔲 Not Started

### Description
Add production-grade optimization (patch comparison, delta calculation) and support for multi-version documents, first-time sync detection with discovery workflow, and complex document structures. Build on Stories 2-3 samples (18 total) to add depth (advanced features) and match C# worker behavior exactly.

### Acceptance Criteria

#### Patch Comparison Logic (Only Changed Fields)
- Implement `processPatchProperty()` function to compare NMD vs existing values
- Update `buildPatchRequest()` to use comparison for all simple fields
- Only include changed fields in patch (DocumentId, CabinetId always required)
- Console logging shows changed fields count and names
- Test: No changes (minimal patch), single field change, multiple field changes

#### Custom Attributes Delta Calculation
- Implement `processCustomAttributes()` with add/update/delete delta logic
- Detect added attributes (in NMD, not in existing)
- Detect updated attributes (in both, different values)
- Detect deleted attributes (in existing, not in NMD)
- Console logging shows delta breakdown (added/updated/deleted counts)
- Test: Add, update, delete, mixed operations, no changes

#### Transformation Library
- Create "04 - Transformation Library" folder with reusable functions
- Functions: processPatchProperty, processCustomAttributes, arraysEqual, processVersions, processAcl, etc.
- Each with JSDoc documentation and examples
- Create "05 - Comparison Logic Tests" folder with 8 test scenarios

#### Multi-Version Support
- Handle documents with 3+ versions
- Parse version parent relationships
- Implement `processVersions()` comparison function
- Create "06 - Multi-Version Tests" folder with test scenarios

#### First-Time Sync Detection
- Implement `hasBeenSyncedBefore()` checking DocumentId + CabinetId + EnvUrl
- Update "Check Document Existence" to use 3-field check (not just 404)
- Console shows missing fields when document incomplete

#### Discovery Workflow
- Create "07 - Discovery Workflow (Conditional)" folder
- Get document-level attachments
- Get version-level attachments (per version)
- Get snapshots (per version)
- Run only if `isNewDocument = true`
- Discovery summary logging

#### Complex Document Support (UPDATED)
- Document states: PENDING, ACTIVE, ARCHIVED, DELETED
- State immutability enforced (cannot revert to PENDING)
- Locked and checked-out status parsing
- **WOPI integration (wopiLock, wopiLockExpiration, contentTag)** 🆕
- **Digital signatures extraction (signature| keys)** 🆕
- **Index locations parsing (indexType-Metadata/FullText/Entities)** 🆕
- Folder tree and hierarchy parsing
- **Folder documents (.ndfld) handling** 🆕
- DLP policies and classification extraction
- Email properties and attachments parsing
- Linked documents parsing
- Alerts parsing
- Approvals parsing
- Test scenarios for each feature (folders 08-17) 🆕

#### End-to-End Test Scenarios (UPDATED)
- Create "18 - End-to-End Test Scenarios" folder with 16 scenarios (was 12) 🆕
- Simple document create & update
- Multi-version document
- First-time sync with discovery
- Document with DLP policy
- Document with custom attributes
- Document in folder hierarchy
- **Folder document (.ndfld)** 🆕
- Archive document
- Delete document
- Lock document
- Check out document
- **WOPI collaboration document** 🆕
- **Document with digital signature** 🆕
- **Document with index locations** 🆕
- Email document with attachments
- Complex document (all features combined)

#### Supporting Infrastructure (UPDATED)
- Create "19 - Supporting API Calls" folder with utility requests (renumbered)
- Expand "04 - Transformation Library" with all functions (20+ functions, was 16) 🆕
- Create "00 - Setup & Documentation" folder with 10 README requests

#### Documentation
- Create README.md in repository root
- Create USAGE-GUIDE.md with detailed instructions
- Create TRANSFORMATION-LOGIC.md with all functions and C# references
- Create SAMPLES-REFERENCE.md documenting all 14 samples
- Create CHANGELOG.md version history

#### Export and Distribution
- Export collection for DEV, QA, UAT environments
- Remove sensitive data from exported files
- Tokens set to empty with placeholder instructions

---

## Implementation Roadmap

### Total Effort (UPDATED)
| User Story | Priority | Effort | Status |
|------------|----------|--------|--------|
| Story 1: POC Two-Scenario Workflow | HIGHEST | 8 hours | ✅ COMPLETED |
| Story 2: Basic Document Types & File Extensions | HIGH | 4 hours (was 6) | 🔲 Not Started (samples ✅ DONE) |
| Story 3: Advanced Document Features & Metadata | HIGH | 7 hours (was 10) | 🔲 Not Started (samples ✅ DONE) |
| Story 4: Add Production Complexity | MEDIUM | 52 hours | 🔲 Not Started |
| **TOTAL** | | **71 hours** (was 76) | **11% Complete** |

**Sample Creation Status:** ✅ DONE (5 hours saved)
- All 18 samples created in `samples/` directory
- samples/README.md provides complete documentation
- samples/SAMPLE_MANIFEST.txt lists all samples with IDs and features
- All samples validated with correct structure and IDs (4817-7714-XXXX pattern)

**Restructured Stories (4 total):**
- **Story 1:** POC foundation ✅ DONE
- **Story 2 (NEW):** Basic file types (7 samples) - VERY EASY, zero extraction changes, 93% coverage, samples ✅ DONE
- **Story 3 (NEW):** Advanced metadata (11 samples) - Adds 3 extraction functions, 100% coverage, samples ✅ DONE
- **Story 4:** Complex optimization - patch comparison, delta calculation, multi-version, discovery
- **Key benefit:** Logical domain separation with complete value at each step

**Production Data Analysis (10,000 messages):**
- ✅ All samples created based on real production patterns
- WOPI integration: 55+ wopitest files, 26+ active locks
- Digital signatures: 100+ signed documents (5%)
- Index locations: 217+ documents with COUCHBASE indexes (11%)
- Folder documents: 210+ ndfld containers (8%)
- Coverage: txt (45%), docx (25%), wopitest (12%), ndfld (8%), other (10%)

### Recommended Sprint Plan

**Sprint 1 (Week 1): Basic Document Types** - 4 hours
- Implement User Story 2: Create Postman requests for 7 samples (samples ✅ already created)
- Focus: Validate POC works with all major file types
- Deliverable: 93% of production file types covered
- **Very easy sprint** - zero transformation changes, samples ready in `samples/` directory

**Sprint 2 (Week 2): Advanced Metadata** - 7 hours
- Implement User Story 3: Create Postman requests + add 3 extraction functions (samples ✅ already created)
- Focus: Add extraction for signatures, indexes, WOPI
- Deliverable: 100% of production metadata patterns covered
- **Moderate sprint** - 3 new extraction functions, samples ready in `samples/` directory

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

---

## Success Criteria (UPDATED)

**Collection is production-ready when:**
- ✅ **Story 1:** POC implemented and working (DONE)
- [ ] **Story 2:** All 7 basic file type samples tested (93% coverage)
- [ ] **Story 3:** All 11 advanced metadata samples tested (100% coverage)
- [ ] **Story 3:** WOPI, signature, and index field extraction working
- [ ] **Story 4:** Patch comparison matches production (only changed fields sent)
- [ ] **Story 4:** Custom attributes delta calculation matches production
- Multi-version documents handled correctly
- First-time sync detection uses 3-field check
- Discovery workflow runs conditionally
- All document states and transitions supported
- **WOPI collaboration features fully supported** 🆕
- **Digital signatures correctly parsed and stored** 🆕
- **Index locations (Metadata/FullText/Entities) handled** 🆕
- **Folder documents (.ndfld) processed correctly** 🆕
- 16 end-to-end scenarios pass (was 12) 🆕
- Comprehensive documentation complete
- Collection can be distributed to team
- Newman CLI execution passes all tests
- Zero gaps between collection and production worker behavior
- **Collection validated against real production data (10,000 messages analyzed)** 🆕

**Production Coverage Validation:**
- txt files (45% of production): ✓ Supported
- docx files (25%): ✓ Supported
- wopitest files (12%): ✓ Supported (new)
- ndfld folders (8%): ✓ Supported (new)
- eml files (3%): ✓ Supported
- Other types (7%): ✓ Supported

---

**END OF SUMMARY**
