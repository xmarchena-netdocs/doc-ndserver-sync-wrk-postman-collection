# doc-ndserver-sync-wrk Postman Collection

This repository contains **two production-ready Postman collections** implementing the `doc-ndserver-sync-wrk` worker functionality:

- **REST API v1** - Legacy metadata service endpoints (PascalCase, structured audit fields)
- **REST API v3** - Modern metadata service endpoints (camelCase, flattened audit fields) ✨ **NEW: 7 document type scenarios (93% production coverage)**

Both collections share comprehensive samples based on production sync message patterns.

## ✨ Latest Updates

**Scenario A Expansion** - Now tests 7 document types covering 93% of production:
- **A1**: TXT Document (Baseline) - 45% of production
- **A2**: DOCX Document (Word) - 25% of production
- **A3**: PDF Document
- **A4**: NDFLD Document (Folder) - 8% of production
- **A5**: WOPITEST Document (Office 365) - 12% of production
- **A6**: EML Document (Email) - 3% of production
- **A7**: Archived Document

Each sub-scenario tests the complete CREATE → Upload → Validate workflow with extension-specific content and validation.

---

## 🚀 Quick Start

### Choose Your API Version

**REST API v1 (Legacy)**
```bash
# 1. Import files into Postman
#    - doc-ndserver-sync-wrk-POC.postman_collection.json
#    - doc-ndserver-sync-wrk-POC.postman_environment.json

# 2. Obtain tokens
cd /home/xmarchena/code/TokenGenerator
dotnet run doc-metadata-api-svc doc-metadata-api-svc "service.create service.read service.update service.delete"
dotnet run doc-content-api-svc doc-content-api-svc "service.create service.read service.update service.delete"

# 3. Run with Newman CLI
cd /home/xmarchena/code/doc-ndserver-sync-wrk-postman-collection
./node_modules/.bin/newman run doc-ndserver-sync-wrk-POC.postman_collection.json \
  -e doc-ndserver-sync-wrk-POC.postman_environment.json
```

**REST API v3 (Modern)**
```bash
# 1. Import files into Postman
#    - doc-ndserver-sync-wrk-POC-v3.postman_collection.json
#    - doc-ndserver-sync-wrk-POC-v3.postman_environment.json

# 2. Obtain tokens (same as v1)
cd /home/xmarchena/code/TokenGenerator
dotnet run doc-metadata-api-svc doc-metadata-api-svc "service.create service.read service.update service.delete"
dotnet run doc-content-api-svc doc-content-api-svc "service.create service.read service.update service.delete"

# 3. Run with Newman CLI
cd /home/xmarchena/code/doc-ndserver-sync-wrk-postman-collection
./node_modules/.bin/newman run doc-ndserver-sync-wrk-POC-v3.postman_collection.json \
  -e doc-ndserver-sync-wrk-POC-v3.postman_environment.json
```

---

## 📁 Repository Structure

```
doc-ndserver-sync-wrk-postman-collection/
│
├── 📄 README.md (this file)
├── 📄 TRANSFORMATION_LIBRARY_USAGE.md   # ✅ Transformation library guide
│
├── 🎯 Sample Messages (18 total - 100% production coverage)
│   └── samples/
│       ├── README.md                                   # ✅ Complete sample documentation
│       ├── SAMPLE_MANIFEST.txt                         # ✅ Quick reference list
│       │
│       ├── Basic Document Types (7 samples - Story 2)
│       │   ├── sample_simple_document.json             # ✅ POC sample (txt, 1 version)
│       │   ├── sample_docx_document.json               # ✅ MS Word file (25% of production)
│       │   ├── sample_pdf_document.json                # ✅ PDF file
│       │   ├── sample_folder_document.json             # ✅ .ndfld container (8% of production)
│       │   ├── sample_wopi_test.json                   # ✅ Office 365 test (12% of production)
│       │   ├── sample_email.json                       # ✅ Email (.eml) with properties
│       │   └── sample_archived.json                    # ✅ Archived state document
│       │
│       └── Advanced Metadata (11 samples - Story 3)
│           ├── sample_custom_attributes.json           # ✅ Dynamic properties (cp| keys)
│           ├── sample_folder_tree.json                 # ✅ Nested folder hierarchy
│           ├── sample_wopi_with_lock.json              # ✅ Active WOPI lock (26+ in prod)
│           ├── sample_signature.json                   # ✅ Digital signature (5% of prod)
│           ├── sample_with_indexes.json                # ✅ COUCHBASE indexes (11% of prod)
│           ├── sample_checked_out.json                 # ✅ CheckedOut status flag
│           ├── sample_collab_edit.json                 # ✅ CollabEdit status flag
│           ├── sample_multiple_versions.json           # ✅ 3 versions with history
│           ├── sample_multiple_acl.json                # ✅ Complex ACL (user+group+cabinet)
│           ├── sample_multiple_snapshots.json          # ✅ Multiple renditions
│           └── sample_complex.json                     # ✅ All features combined
│
├── 📦 REST API v1 Files (Legacy - PascalCase)
│   ├── doc-ndserver-sync-wrk-POC.postman_collection.json     # ✅ v1 collection
│   ├── doc-ndserver-sync-wrk-POC.postman_environment.json    # ✅ v1 environment
│   └── transformation-library.js                              # ✅ v1 transformation logic
│
├── 📦 REST API v3 Files (Modern - camelCase)
│   ├── doc-ndserver-sync-wrk-POC-v3.postman_collection.json  # ✅ v3 collection
│   ├── doc-ndserver-sync-wrk-POC-v3.postman_environment.json # ✅ v3 environment
│   └── v3_transformation_library.js                           # ✅ v3 transformation logic
│
└── 🛠️ Utilities
    └── package.json                                    # ✅ Newman CLI dependency
```

---

## 🔄 REST API v1 vs v3 Comparison

| Feature | REST API v1 (Legacy) | REST API v3 (Modern) |
|---------|---------------------|---------------------|
| **Case Convention** | PascalCase | camelCase |
| **Audit Fields** | Nested objects: `Created { UserId, Timestamp }` | Flattened: `createdBy`, `createdAt` |
| **CheckedOut Structure** | `CheckedOut { UserId, Timestamp, Comment }` | `checkedOut { checkedOutBy, checkedOutAt, comment }` |
| **Locked Structure** | `Locked { UserId, Timestamp, Comment }` | `locked { lockedBy, lockedAt, comment }` |
| **Version Fields** | `Size` | `contentSize`, requires `fileName` and `eTag` |
| **Custom Attributes** | Supports `IsDeleted` flag | No `isDeleted` field - consolidates duplicates |
| **EnvUrl Format** | `Ducot3/1/1/2/9/~timestamp.nev` | `/Ducot3/1/1/2/9/~timestamp.nev` (leading slash) |
| **Timestamp Validation** | Permissive | Strict: `modifiedAt >= createdAt` enforced |
| **Optimistic Locking** | Not required | Requires `eTag` for UPDATE operations |
| **Transformation Library** | `transformation-library.js` | `v3_transformation_library.js` (includes v1→v3 converters) |
| **Endpoints** | `/api/documents/{id}` | `/api/v3/documents/{id}` |

### When to Use Each Version

**Use REST API v1 when:**
- Working with legacy systems that expect PascalCase
- Need backward compatibility with existing integrations
- Custom attributes require deletion tracking (`IsDeleted`)

**Use REST API v3 when:**
- Building new integrations (recommended)
- Need modern JavaScript/JSON conventions (camelCase)
- Want stricter validation and data integrity checks
- Require optimistic locking for concurrent updates

---

## 📊 Sample Coverage

**18 comprehensive samples covering production patterns:**

| Feature Category | Sample Count | Key Samples |
|------------------|--------------|-------------|
| **File Types** | 7 samples | txt, docx, pdf, ndfld folders, wopitest, eml, archived |
| **Advanced Metadata** | 11 samples | Custom attributes, signatures, indexes, WOPI locks, versions, ACLs |

**📖 See [samples/README.md](samples/README.md) for detailed sample documentation**

---

## 📖 Key Documentation

### Transformation Library Guide
- **[TRANSFORMATION_LIBRARY_USAGE.md](TRANSFORMATION_LIBRARY_USAGE.md)** - Comprehensive transformation library documentation
  - v1 vs v3 architecture comparison
  - Core NMD parsing functions (shared by both libraries)
  - v3-specific conversion pipeline
  - Usage examples and API reference
  - Troubleshooting guide

### Sample Documentation
- **[samples/README.md](samples/README.md)** - Complete documentation of all 18 samples
  - Basic types (7 samples): txt, docx, pdf, ndfld, wopitest, eml, archived
  - Advanced metadata (11 samples): custom attrs, signatures, indexes, WOPI, versions, ACLs
  - Production statistics and usage patterns
- **[samples/SAMPLE_MANIFEST.txt](samples/SAMPLE_MANIFEST.txt)** - Quick reference inventory

---

## 🎯 Collection Features

### ✅ Implemented Features
**Both v1 and v3 collections include:**
- Complete NMD message transformation (date conversion, ACL mapping, version building)
- Document state determination (PENDING, ACTIVE, DELETED, PURGE)
- Status flags processing (archived, checked out, locked, autoversion)
- Custom attributes extraction with deletion tracking
- Email metadata parsing (from/to/cc/subject)
- DLP and classification policy extraction
- Linked documents and folder hierarchy parsing
- Content upload workflow with S3 presigned URLs
- Comprehensive logging and debugging output

**v3 collection adds:**
- PascalCase → camelCase conversion
- Audit field flattening
- Timestamp ordering validation
- Optimistic locking with eTag support
- Custom attribute consolidation

---

## 🔍 Collection Capabilities

### ✅ Correctly Implemented
- API call sequence: Check existence → Configure content root → Patch metadata
- Date transformation: `/Date(1761248460620)/` → `2025-10-23T19:41:00.620Z`
- ACL mapping: `VESD` rights → `viewer, editor, sharer, administrator` relations
- Subject type detection: `UG-` (group), `NG-` (cabinet), `DUCOT-` (user)
- Version metadata structure with timestamps and user IDs
- Document state determination: PENDING, ACTIVE, ARCHIVED, DELETED, PURGE
- Complete scenarios with data integrity validation
- Content upload workflow with S3 presigned URLs
- Snapshot creation and verification
- Lock document model parsing
- Collaborative edit detection

---

## 🛠️ Technology Stack

- **Postman Collection v2.1** - API testing and workflow orchestration
- **Newman CLI** - Command-line collection runner
- **JavaScript (ES6)** - Pre-request and test scripts
- **Service-to-Service Tokens** - OAuth 2.0 JWT tokens via TokenGenerator
- **S3 Presigned URLs** - Direct content upload to AWS S3
- **Metadata API** - Document metadata management (doc-metadata-api-svc)
- **Content API** - Document content and storage (doc-content-api-svc)

---

## 🏗️ Related Resources

- **Worker Source Code:** `/home/xmarchena/code/doc-ndserver-sync-wrk/`
- **Existing Postman Environment:** `/home/xmarchena/code/documents-integration-postman/`
- **Token Generator:** `/home/xmarchena/code/TokenGenerator/`
- **Service-to-Service CLI:** `/home/xmarchena/code/idp-docker-utils/service-to-service-cli/`

---

## 📈 Testing & Validation

**To validate the collections:**
1. Import the desired collection (v1 or v3) and environment
2. Obtain service-to-service tokens (metadata and content APIs)
3. Load sample NMD messages from `samples/` directory
4. Run scenarios to test CREATE and UPDATE operations
5. Validate transformation output matches expected format
6. Verify API responses and document state

**Newman CLI execution:**
```bash
./node_modules/.bin/newman run doc-ndserver-sync-wrk-POC.postman_collection.json \
  -e doc-ndserver-sync-wrk-POC.postman_environment.json
```

Or for v3:
```bash
./node_modules/.bin/newman run doc-ndserver-sync-wrk-POC-v3.postman_collection.json \
  -e doc-ndserver-sync-wrk-POC-v3.postman_environment.json
```

---

## 📝 Version History

| Version | Date | Status | Notes |
|---------|------|--------|-------|
| 1.0 | 2024-10-24 | ✅ Completed | Initial v1 collection with transformation library |
| 1.1 | 2024-10-27 | ✅ Completed | 18 samples created |
| 2.0 | 2025-11-06 | ✅ Completed | v3 collection added with camelCase support |
| 2.1 | 2025-11-06 | ✅ Completed | Documentation updated for v1/v3 comparison |

---

**Created:** 2024-10-23
**Last Updated:** 2025-11-06
**Status:** Two production-ready collections (v1 and v3) with comprehensive transformation libraries
**Maintainer:** Implementation based on C# worker analysis and production message patterns
