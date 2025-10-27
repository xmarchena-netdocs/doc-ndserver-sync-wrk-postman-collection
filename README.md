# doc-ndserver-sync-wrk Postman Collection

This directory contains all materials for implementing the `doc-ndserver-sync-wrk` worker functionality as a Postman collection.

## Directory Contents

### 📄 Planning & Documentation
- **`doc-ndserver-sync-wrk-postman-collection-plan.md`** - Complete implementation plan (48KB)
  - Detailed analysis of the worker
  - API call sequences
  - Data transformation logic
  - Environment setup
  - Implementation phases (12-14 hours estimated)

### 📊 Source Data
- **`extract-2025-10-23T19_42_05.620Z.csv`** - Datadog logs export (6.8MB)
  - Production logs from doc-ndserver-sync-wrk
  - Contains real NMD sync messages
  - Used to extract sample messages

### 🎯 Sample Messages
Extracted from production logs, representing different sync scenarios:

1. **`sample_simple_document.json`** (2.9KB)
   - Document ID: `4817-7713-8883`
   - Simple document with 1 version
   - Basic ACL (user + group)
   - No DLP, no custom attributes

2. **`sample_dlp_policy.json`** (3.5KB)
   - Document ID: `4816-0936-6723`
   - DLP policy applied
   - Repository and policy IDs
   - Cabinet-level ACL

3. **`sample_custom_attributes.json`** (3.5KB)
   - Document ID: `4816-0936-6723`
   - Multiple custom properties (`cp|CA-xxx|key`)
   - Origin document tracking

4. **`sample_folder_tree.json`** (3.2KB)
   - Document ID: `4816-5969-8371`
   - Nested folder structure
   - Parent folder reference
   - .ndfld extension

5. **`sample_multiple_versions.json`** (5.3KB)
   - Document ID: `4835-7223-5459`
   - 3 versions with parent relationships
   - Official version tracking
   - Multiple snapshots

## Quick Start

1. **Read the Plan**: Start with `doc-ndserver-sync-wrk-postman-collection-plan.md`

2. **Follow Implementation Phases**:
   - Phase 1: Environment Setup (1h)
   - Phase 2: Collection Structure (1h)
   - Phase 3: Transformation Scripts (4-5h)
   - Phase 4: API Requests (3h)
   - Phase 5: Testing (2-3h)
   - Phase 6: Documentation (1h)

3. **Use Sample Messages**: Load samples into Postman environment variables

## Next Steps

- [ ] Create Postman environment file
- [ ] Create Postman collection file
- [ ] Implement transformation scripts
- [ ] Implement API requests
- [ ] Test with all samples
- [ ] Document results

## Related Resources

- Worker source code: `/home/xmarchena/code/doc-ndserver-sync-wrk/`
- Existing Postman environment: `/home/xmarchena/code/documents-integration-postman/`

---

**Created:** 2025-10-23
**Status:** Planning Complete - Ready for Implementation
