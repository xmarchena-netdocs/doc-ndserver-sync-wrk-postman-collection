# Postman Collection vs doc-ndserver-sync-wrk: V3 API Comparison

## Executive Summary

This document provides a detailed comparison between the Postman v3 collection implementation and the actual `doc-ndserver-sync-wrk` C# service, focusing on v3 API endpoint usage and identifying gaps in the Postman collection.

**Date:** 2025-11-06
**Collections Analyzed:**
- `doc-ndserver-sync-wrk-POC-v3.postman_collection.json`
- `doc-ndserver-sync-wrk/` (C# implementation)

---

## V3 API Endpoints Comparison

### Endpoints Used by sync-wrk Service

| Endpoint | Method | Purpose | Postman | sync-wrk |
|----------|--------|---------|---------|----------|
| `/v3/documents/{documentId}/extended` | GET | Retrieve existing document (for eTag) | ✅ | ✅ |
| `/v3/documents/{documentId}/extended` | PUT | Upsert (create/update) extended document | ✅ | ✅ |
| `/v3/documents/{documentId}/acl-relationships` | PUT | Set ACL relationships | ❌ | ✅ |
| `/v3/documents/{documentId}/acl-relationships` | DELETE | Remove all ACL relationships | ❌ | ✅ |

### Endpoints in Postman Collection Only

| Endpoint | Method | Purpose | Notes |
|----------|--------|---------|-------|
| `/v1/content/{documentId}/versions/{versionId}/snapshots` | POST | Create content snapshot | Uses v1, not v3 |
| `/v1/content/{documentId}/versions/{versionId}/snapshots` | GET | Verify snapshot exists | Uses v1, not v3 |

---

## Key Differences in Implementation

### 1. ACL Management

**sync-wrk Service:**
```csharp
// Separate ACL relationship calls after document upsert
if (aclRelationships == null || aclRelationships.Length == 0)
{
    await metadataServiceClient.DeleteAclRelationshipsAsync(
        documentId: mappingContext.DocumentId,
        cancellationToken: cancellationToken);
}
else
{
    await metadataServiceClient.PutAclRelationshipsAsync(
        documentId: mappingContext.DocumentId,
        relationships: aclRelationships,
        cancellationToken: cancellationToken);
}
```

**Postman Collection:**
- ❌ **MISSING**: No separate ACL relationship endpoint calls
- ACLs are embedded in the ExtendedDocument PUT request body
- Does not use `/v3/documents/{documentId}/acl-relationships` endpoints

**Impact:** The Postman collection may not properly handle ACL synchronization as the service expects separate ACL calls.

---

### 2. Document Upsert Logic

**sync-wrk Service:**
```csharp
// Step 1: Get existing document for eTag (404 if new)
var oldDocument = await GetExistingDocumentAsync(documentId, cancellationToken);
var isNewDocument = oldDocument == null;

// Step 2: Prepare document with eTag from existing
var newDocument = incomingDocument with
{
    ETag = oldDocument?.ETag  // Optimistic locking
};

// Step 3: Upsert with eTag
await metadataServiceClient.UpsertExtendedDocumentAsync(
    documentId: documentId,
    request: newDocument,
    cancellationToken: cancellationToken);
```

**Postman Collection:**
```javascript
// v3 transformation includes eTag handling
if (operationType === 'UPDATE') {
    const currentETag = pm.environment.get('currentETag');
    if (currentETag) {
        v3PatchRequest.eTag = currentETag;
    }
}
```

**✅ Status:** Postman collection properly implements eTag-based optimistic locking for UPDATE operations.

---

### 3. NMD to ExtendedDocument Mapping

**sync-wrk Service Uses Specialized Mappers:**
- `DocumentStateMapper` - Calculates PENDING/ACTIVE/DELETED/PURGE states
- `CheckedOutMapper` - Maps checked-out status with collaboration edit support
- `LockedMapper` - Parses `lockDocumentModel` JSON
- `PolicyIdMapper` - Extracts DLP policy from JSON
- `ClassificationIdMapper` - Parses classification JSON
- `EmailMapper` - Parses HTML-encoded XML email properties
- `AlertsMapper` - Extracts alert notifications from dynamic properties
- `ApprovalsMapper` - Extracts approvals from dynamic properties
- `VersionsMapper` - Maps versions with signature support
- `DocumentAttachmentsMapper` - Extracts attachments with size calculations
- `CustomAttributesMapper` - Processes custom attributes with `cp|` prefix
- `LinkedDocumentsMapper` - Parses comma-separated linked document IDs

**Postman Collection:**
- ✅ Has basic transformation functions in `v3_transformation_library.js`
- ⚠️ **SIMPLIFIED**: Less comprehensive than C# mappers
- ❌ **MISSING**: Some advanced mappers (attachments, document-level approvals)

---

### 4. Error Handling and Retries

**sync-wrk Service:**
```csharp
// Retryable: 5xx, 408, 409, 429
if (statusCode >= 500 || statusCode == 408 || statusCode == 409 || statusCode == 429)
{
    throw new MessageRetryableException(...);
}

// Non-retryable: 4xx client errors
throw new MessageNotRetryableException(...);
```

**Postman Collection:**
- ❌ **MISSING**: No retry logic
- ❌ **MISSING**: No error classification (retryable vs non-retryable)
- Manual re-execution required on failures

**Impact:** Postman cannot automatically recover from transient failures.

---

### 5. Content Discovery and Upload

**sync-wrk Service:**
- Has `ContentDiscoveryService` for identifying content to upload
- Conditional content upload based on discovery results
- Version snapshot management
- Handles deferred S3 content loading

**Postman Collection:**
- ✅ Has basic content upload workflow (`02a - Upload Initial Content`)
- ✅ Creates snapshots and uploads to S3
- ❌ **MISSING**: Content discovery logic
- ❌ **MISSING**: Conditional execution based on existing content

---

### 6. Message Processing Flow

**sync-wrk Service Complete Flow:**
```
1. SQS Message Consumption (FIFO queue with message groups)
2. S3 Content Loading (deferred if message size > threshold)
3. NMD Message Validation
4. Document State Calculation
5. ExtendedDocument Mapping (with 40+ mappers)
6. GET existing document (for eTag)
7. PUT ExtendedDocument (with eTag)
8. PUT or DELETE ACL relationships
9. Content Discovery (identify versions needing content)
10. Content Upload (snapshots to S3)
11. Kafka Event Publishing (document state changes)
12. Statistics Logging
```

**Postman Collection Flow:**
```
1. Load NMD sample (manual environment variable setting)
2. Build CREATE/UPDATE request (transformation library)
3. GET existing document (for UPDATE scenarios)
4. PUT ExtendedDocument
5. Upload content (separate scenario)
6. Validation (GET to verify)
```

**Missing from Postman:**
- SQS message consumption
- S3 content deferred loading
- Content discovery
- Kafka event publishing
- Statistics logging
- Automated workflow orchestration

---

## Missing Features in Postman Collection

### Critical (Blocks Feature Parity)

1. **ACL Relationship Endpoints** ❌
   - Missing: `PUT /v3/documents/{documentId}/acl-relationships`
   - Missing: `DELETE /v3/documents/{documentId}/acl-relationships`
   - Impact: ACLs may not synchronize correctly

2. **Separate ACL Synchronization Logic** ❌
   - ACLs are embedded in document PUT
   - Service expects separate ACL calls after document upsert
   - Impact: ACL updates may fail or be ignored

3. **Error Handling and Retry Logic** ❌
   - No automatic retry for transient failures
   - No error classification (retryable vs non-retryable)
   - Impact: Manual intervention required for failures

### High Priority (Limits Production Use)

4. **Content Discovery Service** ❌
   - No logic to identify which versions need content upload
   - No conditional content upload based on existing snapshots
   - Impact: May upload content unnecessarily or miss required uploads

5. **Kafka Event Publishing** ❌
   - No integration with Kafka for state change events
   - Impact: Downstream services won't be notified of changes

6. **SQS Integration** ❌
   - No SQS message consumption
   - No FIFO queue support with message groups
   - Impact: Cannot process messages from production queue

7. **Advanced Mappers** ⚠️
   - Simplified attachment mapping
   - Missing document-level approval handling
   - Less comprehensive validation
   - Impact: Some edge cases may not be handled correctly

### Medium Priority (Nice to Have)

8. **Statistics and Metrics** ❌
   - No performance tracking
   - No sync operation statistics
   - Impact: No visibility into performance

9. **Observability** ❌
   - No distributed tracing
   - No structured logging with correlation IDs
   - Impact: Difficult to troubleshoot issues

10. **Configuration Management** ❌
    - No AWS AppConfig integration
    - No dynamic configuration updates
    - Impact: Requires collection re-import for config changes

---

## Recommendations

### Immediate Actions (Critical)

1. **Add ACL Relationship Endpoints**
   ```javascript
   // Add to Postman collection after document PUT
   PUT {{metadataBaseUrl}}/v3/documents/{{documentId}}/acl-relationships
   Body: [ACL relationships array]

   // Or if no ACLs:
   DELETE {{metadataBaseUrl}}/v3/documents/{{documentId}}/acl-relationships
   ```

2. **Implement ACL Synchronization Logic**
   - Extract ACL relationships from NMD message
   - Determine if PUT or DELETE is needed
   - Execute ACL call after document upsert

3. **Add Error Handling**
   - Check response status codes
   - Implement retry logic for 5xx, 408, 409, 429
   - Log non-retryable errors (4xx)

### High Priority (Production Readiness)

4. **Implement Content Discovery**
   - Check existing snapshots before upload
   - Only upload new/changed content
   - Handle multiple versions

5. **Add Kafka Integration** (if applicable)
   - Publish state change events
   - Include document ID, cabinet ID, state

6. **Consider Newman + SQS Integration**
   - Use Newman as CLI runner
   - Read messages from SQS
   - Process messages in batches

### Medium Priority (Enhanced Testing)

7. **Expand Transformation Library**
   - Add missing mappers (attachments, approvals)
   - Enhance validation logic
   - Add edge case handling

8. **Add Observability**
   - Log all API calls with correlation IDs
   - Track execution time
   - Report errors with context

---

## Architecture Pattern Differences

### sync-wrk Service (Hexagonal Architecture)

```
┌─────────────────────────────────────────────┐
│  Driving Adapters (Inbound)                 │
│  - SqsConsumer                              │
│  - NmdEventConsumer                         │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│  Core Domain (Business Logic)               │
│  - MetadataSynchronizationService           │
│  - ContentDiscoveryService                  │
│  - Mappers (ACL, DLP, Email, etc.)          │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│  Driven Adapters (Outbound)                 │
│  - MetadataServiceClient (v3)               │
│  - ContentServiceClient (v1)                │
│  - KafkaProducer                            │
│  - S3Storage                                │
└─────────────────────────────────────────────┘
```

### Postman Collection (Request-Response)

```
┌─────────────────────────────────────────────┐
│  Manual Trigger / Newman CLI                │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│  Pre-request Scripts                        │
│  - Load NMD from environment                │
│  - Transform to v3 format                   │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│  HTTP Requests                              │
│  - PUT /v3/documents/{id}/extended          │
│  - GET /v3/documents/{id}/extended          │
│  - POST /v1/content (snapshots)             │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│  Test Scripts (Validation)                  │
│  - Check status codes                       │
│  - Validate response structure              │
└─────────────────────────────────────────────┘
```

---

## Endpoint Mapping Summary

| Feature | sync-wrk Endpoint | Postman Collection | Status |
|---------|------------------|-------------------|--------|
| **Document Upsert** | PUT `/v3/documents/{id}/extended` | ✅ Implemented | ✅ |
| **Get Document** | GET `/v3/documents/{id}/extended` | ✅ Implemented | ✅ |
| **ACL Update** | PUT `/v3/documents/{id}/acl-relationships` | ❌ Missing | ❌ |
| **ACL Delete** | DELETE `/v3/documents/{id}/acl-relationships` | ❌ Missing | ❌ |
| **Content Upload** | POST `/v1/content/{id}/versions/{ver}/snapshots` | ✅ Implemented | ✅ |
| **Content Verify** | GET `/v1/content/{id}/versions/{ver}/snapshots` | ✅ Implemented | ✅ |

---

## Conclusion

The Postman v3 collection provides a **good foundation** for testing v3 API endpoints but is **missing critical features** required for full parity with the `doc-ndserver-sync-wrk` service:

### Strengths
- ✅ Proper v3 ExtendedDocument upsert
- ✅ eTag-based optimistic locking
- ✅ Comprehensive NMD transformation library
- ✅ Content upload workflow
- ✅ camelCase support

### Critical Gaps
- ❌ Missing ACL relationship endpoints
- ❌ No separate ACL synchronization
- ❌ No error handling/retry logic
- ❌ Missing content discovery
- ❌ No Kafka integration

### Recommendation
Prioritize implementing ACL relationship endpoints and synchronization logic to achieve feature parity with the sync-wrk service's core functionality.
