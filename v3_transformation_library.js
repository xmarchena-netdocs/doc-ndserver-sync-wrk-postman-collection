// ========================================================================
// NMD MESSAGE TRANSFORMATION LIBRARY
// ========================================================================
// This library provides functions to transform NetDocuments NMD messages
// into API request payloads for the metadata service.
//
// Usage: These functions are defined at collection level and can be called
// from any request pre-request script in the collection.
// ========================================================================

// ------------------------------------------------------------------------
// UTILITY FUNCTIONS
// ------------------------------------------------------------------------

/**
 * Convert NetDocuments date format to ISO 8601
 * @param {string} dateStr - Date in format: /Date(1725881590170)/
 * @returns {string} ISO 8601 date: 2024-09-09T07:33:10.170Z
 */
function convertDate(dateStr) {
    if (!dateStr) return null;
    const match = dateStr.match(/\d+/);
    if (!match) return null;
    return new Date(parseInt(match[0])).toISOString();
}

/**
 * Convert ModNum (long format) to ISO 8601
 * @param {number} modNum - Format: 20240909053336957 (yyyyMMddHHmmssfff)
 * @returns {string} ISO 8601 date
 */
function convertModNumToISO(modNum) {
    if (!modNum) return null;
    const str = modNum.toString();
    if (str.length !== 17) return null;

    const year = str.substring(0, 4);
    const month = str.substring(4, 6);
    const day = str.substring(6, 8);
    const hour = str.substring(8, 10);
    const minute = str.substring(10, 12);
    const second = str.substring(12, 14);
    const ms = str.substring(14, 17);

    return `${year}-${month}-${day}T${hour}:${minute}:${second}.${ms}Z`;
}

// ------------------------------------------------------------------------
// ACL TRANSFORMATION
// ------------------------------------------------------------------------

/**
 * Get subject type based on GUID prefix
 * @param {string} guid - Entity GUID (e.g., "DUCOT-user", "UG-group", "NG-cabinet")
 * @returns {string} Subject type: "user", "group", or "cabinet"
 */
function getSubjectType(guid) {
    if (!guid) return 'user';
    if (guid.startsWith('UG-')) return 'group';
    if (guid.startsWith('NG-') || guid.startsWith('CA-')) return 'cabinet';
    return 'user';
}

/**
 * Map NetDocuments rights characters to relation names
 * @param {string} rights - Rights string (e.g., "VESD")
 * @returns {string[]} Array of relation names
 */
function mapRightsToRelations(rights) {
    const rightsMap = {
        'V': 'viewer',
        'E': 'editor',
        'S': 'sharer',
        'D': 'administrator',
        'A': 'administrator',
        'N': 'denied',
        'Z': 'default'
    };

    return (rights || '').split('').map(r => rightsMap[r]).filter(Boolean);
}

/**
 * Build ACL information including document-level and version-level ACLs
 * @param {object} nmdMessage - Full NMD message
 * @returns {object[]} Array of ACL entries
 */
function buildAcl(nmdMessage) {
    const envProps = nmdMessage.envProps;
    const versions = nmdMessage.documents['1'].versions;

    // 1. Document-level ACLs
    const documentAcls = (envProps.acl || []).map(entry => ({
        SubjectType: getSubjectType(entry.guid),
        SubjectId: entry.guid,
        Relations: mapRightsToRelations(entry.rights)
    }));

    // 2. Version-level ACLs (Official Only Access)
    const versionAclEntityIds = new Set();

    // Extract entity IDs from version access strings
    for (const versionKey in versions) {
        const version = versions[versionKey];
        const accessString = version.verProps.access;

        if (accessString) {
            // Format: "VDUCOT-user1|VESD:VDUCOT-user2|VE"
            const matches = accessString.matchAll(/[A-Z]([A-Z0-9-]+)\|([A-Z]+)/g);
            for (const match of matches) {
                versionAclEntityIds.add(match[1]);
            }
        }
    }

    // 3. Entities only in version ACL get "official_access_only"
    const documentAclGuids = new Set(documentAcls.map(acl => acl.SubjectId.toUpperCase()));
    const officialOnlyAcls = [];

    for (const entityId of versionAclEntityIds) {
        if (!documentAclGuids.has(entityId.toUpperCase())) {
            officialOnlyAcls.push({
                SubjectType: getSubjectType(entityId),
                SubjectId: entityId,
                Relations: ['official_access_only']
            });
        }
    }

    return documentAcls.concat(officialOnlyAcls);
}

// ------------------------------------------------------------------------
// VERSION TRANSFORMATION
// ------------------------------------------------------------------------

/**
 * Build versions list from NMD message
 * @param {object} versions - Versions object from NMD
 * @returns {object[]} Array of DocumentVersion objects
 */
function buildVersions(versions) {
    const versionsList = [];

    for (const [versionId, versionData] of Object.entries(versions || {})) {
        const props = versionData.verProps;

        versionsList.push({
            VersionId: parseInt(versionId),
            Name: props.verName || versionId,
            Description: props.description || '',
            Extension: props.exten,
            Label: props.verLabel,
            Size: props.size,
            Locked: props.locked || false,
            DeliveryRevoked: props.deliveryRevoked || false,
            Created: {
                UserId: props.creatorguid,
                Timestamp: convertDate(props.created)
            },
            Modified: {
                UserId: props.modifiedByGuid || props.creatorguid,
                Timestamp: convertDate(props.modified || props.created)
            },
            State: props.deleted ? 'DELETED' : 'ACTIVE',
            CopiedFrom: props.parent ? parseInt(props.parent) : null,
            LegacySignatures: null
        });
    }

    return versionsList;
}

// ------------------------------------------------------------------------
// STATUS FLAGS PROCESSING
// ------------------------------------------------------------------------

/**
 * Extract document state flags from bitwise status field
 * @param {number} status - Bitwise status flags
 * @returns {object} Object with archived, autoVersion, isCheckedOut, isLocked flags
 */
function extractStatusFlags(status) {
    if (!status) {
        return {
            archived: false,
            autoVersion: false,
            isCheckedOut: false,
            isLocked: false
        };
    }

    // Bitwise flags from NmdDocStatusFlags enum (matches C# implementation)
    const FLAGS = {
        CheckedOut: 1,      // Document is checked out
        Email: 2,           // Document is an email
        Archived: 4,        // Document is archived
        Autoversion: 8,     // Auto-versioning enabled
        CollabEdit: 16,     // Collaborative editing active
        Locked: 32          // Document is locked
    };

    return {
        archived: (status & FLAGS.Archived) !== 0,
        autoVersion: (status & FLAGS.Autoversion) !== 0,
        isCheckedOut: (status & FLAGS.CheckedOut) !== 0,
        isLocked: (status & FLAGS.Locked) !== 0,
        isEmail: (status & FLAGS.Email) !== 0,
        isCollabEdit: (status & FLAGS.CollabEdit) !== 0
    };
}

/**
 * Build CheckedOut object from document properties
 * @param {object} docProps - Document properties from NMD
 * @param {boolean} isCheckedOut - Whether document is checked out
 * @returns {object} CheckedOut object
 */
function buildCheckedOut(docProps, isCheckedOut) {
    // Check for collaborative edit indicators (may not set isCheckedOut flag correctly)
    const hasCollabEdit = docProps.collabEditType || docProps.collaborationEditType;

    if (!isCheckedOut && !hasCollabEdit) {
        return {
            UserId: null,
            Timestamp: null,
            Comment: null,
            CollaborationEdit: null,
            CollaborationEditType: null
        };
    }

    let comment = docProps.actionComment || '';

    // Remove collaboration edit type prefix if present
    const prefix = 'CollaborationEditType:';
    if (comment.startsWith(prefix)) {
        comment = comment.substring(prefix.length);
    }

    return {
        UserId: docProps.actionBy || null,
        Timestamp: convertDate(docProps.actionDate),
        Comment: comment,
        CollaborationEdit: docProps.collaborationEdit || null,
        CollaborationEditType: docProps.collabEditType || docProps.collaborationEditType || null
    };
}

/**
 * Build Locked object from document properties
 * @param {object} docProps - Document properties from NMD
 * @param {boolean} isLocked - Whether document is locked
 * @returns {object} Locked object
 */
function buildLocked(docProps, isLocked) {
    // Check if lockDocumentModel exists first (NetDocuments format)
    // This takes precedence over the isLocked flag which may be unreliable
    if (docProps.lockDocumentModel) {
        try {
            // Parse the JSON string
            const lockModel = JSON.parse(docProps.lockDocumentModel);
            return {
                UserId: lockModel.ActionBy || null,
                Comment: lockModel.Comment || null,
                Timestamp: convertDate(lockModel.ActionDate)
            };
        } catch (e) {
            console.log(`⚠️  Warning: Failed to parse lockDocumentModel: ${e.message}`);
        }
    }

    // If no lockDocumentModel and not flagged as locked, return nulls
    if (!isLocked) {
        return {
            UserId: null,
            Comment: null,
            Timestamp: null
        };
    }

    // Fallback to legacy fields if flagged as locked but no lockDocumentModel
    return {
        UserId: docProps.actionBy || null,
        Comment: docProps.actionComment || null,
        Timestamp: convertDate(docProps.actionDate)
    };
}

// ------------------------------------------------------------------------
// CUSTOM ATTRIBUTES EXTRACTION
// ------------------------------------------------------------------------

/**
 * Extract custom attributes from document properties
 * @param {object} docProps - Document properties from NMD
 * @returns {object[]} Array of custom attributes
 */
function extractCustomAttributes(docProps) {
    const customAttributes = [];

    // List of known system properties to exclude
    const systemProperties = [
        'docNum', 'id', 'status', 'officialVersion', 'lastVerNo', 'verLabel',
        'name', 'nameModNum', 'contentModNum', 'actionBy', 'actionDate',
        'actionComment', 'links', 'emailProps', 'indexType-Metadata',
        'indexLocation-Metadata', 'indexType-FullText', 'indexLocation-FullText',
        'indexType-Entities', 'indexLocation-Entities', 'collaborationEdit',
        'collaborationEditType', 'parent', 'docNum',
        // Additional system properties that should not be custom attributes
        'deleted', 'locked', 'lockDocumentModel', 'wopiLock', 'collabEditType',
        'archived', 'autoVersion', 'nextVersion', 'envUrl', 'aclFreeze',
        'created', 'modified', 'approval', 'docSize', 'cabinetId', 'state'
    ];

    for (const [key, value] of Object.entries(docProps)) {
        // Skip system properties
        if (systemProperties.includes(key)) continue;

        // Skip deletion markers
        if (key.endsWith('_IsDeleted')) continue;

        // Only process custom attributes with cp| prefix (NetDocuments custom properties)
        if (!key.startsWith('cp|')) continue;

        // Parse the custom attribute key format: cp|AttributeId|FieldNum
        // Example: cp|CA-7MZORBLU|1 -> Extract "CA-7MZORBLU" as the attribute ID
        const parts = key.split('|');
        if (parts.length !== 3) continue; // Skip malformed keys

        const attributeId = parts[1]; // The actual custom attribute identifier

        // Check if this attribute has a deletion marker
        const isDeleted = docProps[`${key}_IsDeleted`] === true;

        customAttributes.push({
            Key: attributeId,  // Use "Key" not "Name" per REST v2 API spec
            Values: value !== null && value !== undefined ? [value.toString()] : [],  // Use "Values" (array) not "Value"
            IsDeleted: isDeleted
        });
    }

    return customAttributes;
}

// ------------------------------------------------------------------------
// LINKED DOCUMENTS
// ------------------------------------------------------------------------

/**
 * Parse linked documents from comma-separated string
 * @param {string} links - Comma-separated document IDs
 * @returns {string[]} Array of document IDs
 */
function parseLinkedDocuments(links) {
    if (!links) return [];
    return links.split(',').map(link => link.trim()).filter(Boolean);
}

// ------------------------------------------------------------------------
// FOLDER HIERARCHY
// ------------------------------------------------------------------------

/**
 * Parse parent folders from space-separated URLs or array
 * @param {string|string[]} jumbofolders - Space-separated folder URLs or array
 * @returns {string[]} Array of folder URLs
 */
function parseParentFolders(jumbofolders) {
    if (!jumbofolders) return [];

    // Handle array format (from some NMD samples)
    if (Array.isArray(jumbofolders)) {
        return jumbofolders;
    }

    // Handle string format (space-separated)
    if (typeof jumbofolders === 'string') {
        return jumbofolders.split(' ').filter(Boolean);
    }

    return [];
}

/**
 * Parse folder tree from pipe-separated paths or array
 * @param {string|string[]} foldertree - Pipe-separated folder paths or array
 * @returns {string[]} Array of folder paths
 */
function parseFolderTree(foldertree) {
    if (!foldertree) return [];

    // Handle array format (from some NMD samples)
    if (Array.isArray(foldertree)) {
        return foldertree;
    }

    // Handle string format (pipe-separated)
    if (typeof foldertree === 'string') {
        return foldertree.split('|').filter(Boolean);
    }

    return [];
}

// ------------------------------------------------------------------------
// DLP AND CLASSIFICATION
// ------------------------------------------------------------------------

/**
 * Extract policy ID from classification string
 * @param {string} classification - Format: "NG-8RZI6EOH:RL-CONFIDENTIAL"
 * @returns {string} Policy ID (e.g., "RL-CONFIDENTIAL")
 */
function extractClassificationId(classification) {
    if (!classification) return '';
    const parts = classification.split(':');
    return parts.length === 2 ? parts[1] : '';
}

/**
 * Extract policy ID from DLP string
 * @param {string} dlp - Format: "NG-8RZI6EOH:AC-DLPPOLICY1"
 * @returns {string} Policy ID (e.g., "AC-DLPPOLICY1")
 */
function extractPolicyId(dlp) {
    if (!dlp) return '';
    const parts = dlp.split(':');
    return parts.length === 2 ? parts[1] : '';
}

// ------------------------------------------------------------------------
// EMAIL METADATA
// ------------------------------------------------------------------------

/**
 * Parse email metadata from XML string
 * @param {string} emailPropsXml - Email properties in XML format
 * @returns {object|null} Email info object or null
 */
function parseEmailInfo(emailPropsXml) {
    if (!emailPropsXml) return null;

    try {
        // Simple XML parsing for basic email fields
        const getXmlValue = (xml, tag) => {
            const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i');
            const match = xml.match(regex);
            return match ? match[1] : null;
        };

        const from = getXmlValue(emailPropsXml, 'from');
        const to = getXmlValue(emailPropsXml, 'to');
        const cc = getXmlValue(emailPropsXml, 'cc');
        const subject = getXmlValue(emailPropsXml, 'subject');
        const sent = getXmlValue(emailPropsXml, 'sent');

        if (!from && !to) return null; // Not a valid email

        return {
            From: from,
            To: to ? to.split(';').filter(Boolean) : [],
            Cc: cc ? cc.split(';').filter(Boolean) : [],
            Subject: subject,
            SentDate: sent
        };
    } catch (error) {
        console.warn('Failed to parse email properties:', error);
        return null;
    }
}

// ------------------------------------------------------------------------
// DELETED CABINETS
// ------------------------------------------------------------------------

/**
 * Extract deleted cabinets list
 * @param {string[]} deletedcabs - Array of cabinet IDs
 * @returns {string[]} Array of cabinet IDs
 */
function extractDeletedCabinets(deletedcabs) {
    return deletedcabs || [];
}

// ------------------------------------------------------------------------
// ENVURL EXTRACTION
// ------------------------------------------------------------------------

/**
 * Extract EnvUrl (S3 key path) from full NetDocuments URL
 * @param {string} url - Full URL (e.g., https://ducot.netdocuments.com/Ducot3/1/1/2/9/~251023154100603.nev)
 * @returns {string} EnvUrl (e.g., Ducot3/1/1/2/9/~251023154100603.nev)
 */
function extractEnvUrl(url) {
    if (!url) return '';
    const match = url.match(/https?:\/\/[^\/]+\/(.*)/);
    return match ? match[1] : url;
}

// ------------------------------------------------------------------------
// DOCUMENT STATE LOGIC
// ------------------------------------------------------------------------

/**
 * Determine document state based on NMD message
 * Matches C# NmdDocumentStateConverter logic
 * @param {object} nmdMessage - Full NMD message
 * @returns {string} Document state: PENDING, ACTIVE, DELETED, or PURGE
 */
function determineDocumentState(nmdMessage) {
    const doc = nmdMessage.documents['1'];
    const docProps = doc.docProps;
    const envProps = nmdMessage.envProps;

    // PURGE takes highest precedence
    if (envProps.purged === true) {
        return 'PURGE';
    }

    // DELETED if removed from all cabinets
    const containingCabs = envProps.containingcabs || [];
    const deletedCabs = envProps.deletedcabs || [];
    const deletedFromAllCabs = containingCabs.length === 0 && deletedCabs.length > 0;

    if (deletedFromAllCabs && docProps.status === 0) {
        return 'DELETED';
    }

    // ACTIVE if document has versions with snapshots
    const versions = doc.versions || {};
    const hasSnapshots = Object.values(versions).some(version => {
        // Snapshots are nested under verProps in NMD structure
        const verProps = version.verProps || {};
        const snapshots = verProps.snapshots || [];
        return snapshots.length > 0;
    });

    if (hasSnapshots) {
        return 'ACTIVE';
    }

    // Default to PENDING for new documents without content
    return 'PENDING';
}

// ------------------------------------------------------------------------
// MAIN TRANSFORMATION FUNCTION
// ------------------------------------------------------------------------

/**
 * Build complete PATCH request from NMD message
 * @param {object} nmdMessage - Full NMD message
 * @param {string} operationType - 'CREATE' or 'UPDATE'
 * @returns {object} Complete PatchDocumentRequest
 */
function buildPatchRequest(nmdMessage, operationType = 'CREATE') {
    const doc = nmdMessage.documents['1'];
    const docProps = doc.docProps;
    const envProps = nmdMessage.envProps;

    // Extract status flags
    const statusFlags = extractStatusFlags(docProps.status);

    // Determine document state
    const documentState = determineDocumentState(nmdMessage);

    // Build base patch request
    const patchRequest = {
        DocumentId: docProps.id,
        CabinetId: envProps.containingcabs[0],
        Name: docProps.name,
        State: documentState,
        OfficialVersion: docProps.lastVerNo,
        NextVersion: docProps.lastVerNo + 1,
        EnvUrl: extractEnvUrl(envProps.url),
        ParentFolders: parseParentFolders(envProps.jumbofolders),
        FolderTree: parseFolderTree(envProps.foldertree),
        AclFreeze: false,
        Archived: statusFlags.archived,
        AutoVersion: statusFlags.autoVersion,
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
        CheckedOut: buildCheckedOut(docProps, statusFlags.isCheckedOut),
        Locked: buildLocked(docProps, statusFlags.isLocked),
        LinkedDocuments: parseLinkedDocuments(docProps.links),
        CustomAttributes: extractCustomAttributes(docProps),
        Versions: buildVersions(doc.versions),
        Acl: buildAcl(nmdMessage),
        PolicyId: extractPolicyId(envProps.dlp),
        ClassificationId: extractClassificationId(envProps.dataclassification),
        DeletedCabinets: extractDeletedCabinets(envProps.deletedcabs),
        Alerts: null,
        Approvals: null,
        EmailInfo: parseEmailInfo(docProps.emailProps)
    };

    // For UPDATE operation, modify document name to indicate update
    if (operationType === 'UPDATE') {
        patchRequest.Name = docProps.name + ' [UPDATED]';
        patchRequest.DocModNum = parseInt(envProps.docmodnum) + 1;
        patchRequest.NameModNum = parseInt(docProps.nameModNum) + 1;
        patchRequest.Modified = {
            UserId: envProps['modified by guid'],
            Timestamp: new Date().toISOString()
        };
    }

    return patchRequest;
}

// ------------------------------------------------------------------------
// HELPER: Save Patch Request to Environment
// ------------------------------------------------------------------------

/**
 * Build and save patch request to environment variable
 * @param {string} operationType - 'CREATE' or 'UPDATE'
 */

// ========================================================================
// V3 API TRANSFORMATION FUNCTIONS
// ========================================================================
// These functions convert v1-style requests to v3 API format
// - Convert PascalCase to camelCase
// - Flatten nested audit structures (created/modified)
// - Rename nested object fields (checkedOut/locked)

function convertToCamelCase(obj) {
    if (Array.isArray(obj)) {
        var result = [];
        for (var i = 0; i < obj.length; i++) {
            result.push(convertToCamelCase(obj[i]));
        }
        return result;
    } else if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    
    var newObj = {};
    for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
            var camelKey = key.charAt(0).toLowerCase() + key.slice(1);
            newObj[camelKey] = convertToCamelCase(obj[key]);
        }
    }
    return newObj;
}

function transformToV3Structure(obj) {
    if (!obj || typeof obj !== 'object') {
        return obj;
    }

    // Handle arrays by recursively transforming each element
    if (Array.isArray(obj)) {
        var result = [];
        for (var i = 0; i < obj.length; i++) {
            result.push(transformToV3Structure(obj[i]));
        }
        return result;
    }

    // Copy all properties with recursive transformation
    var transformed = {};
    for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
            var value = obj[key];

            // Recursively transform arrays
            if (Array.isArray(value)) {
                transformed[key] = transformToV3Structure(value);
            }
            // For nested objects, don't recursively transform created/modified yet
            // They will be flattened below
            else if (value && typeof value === 'object' && key !== 'created' && key !== 'modified' && key !== 'checkedOut' && key !== 'locked') {
                transformed[key] = transformToV3Structure(value);
            }
            else {
                transformed[key] = value;
            }
        }
    }

    // Flatten created -> createdBy/createdAt
    if (transformed.created && typeof transformed.created === 'object') {
        transformed.createdBy = transformed.created.userId;
        transformed.createdAt = transformed.created.timestamp;
        delete transformed.created;
    }

    // Flatten modified -> modifiedBy/modifiedAt
    if (transformed.modified && typeof transformed.modified === 'object') {
        transformed.modifiedBy = transformed.modified.userId;
        transformed.modifiedAt = transformed.modified.timestamp;
        delete transformed.modified;
    }

    // Version-specific field mappings
    if (transformed.versionId !== undefined) {
        // This is a version object
        // Map size -> contentSize (v3 API uses contentSize)
        if (transformed.size !== undefined) {
            transformed.contentSize = transformed.size;
            delete transformed.size;
        }

        // fileName is required in v3, generate from extension if missing
        if (!transformed.fileName && transformed.extension) {
            transformed.fileName = 'document.' + transformed.extension;
        }

        // Add eTag if missing (required field)
        if (!transformed.eTag) {
            transformed.eTag = '';
        }
    }

    // Transform checkedOut structure
    if (transformed.checkedOut && typeof transformed.checkedOut === 'object') {
        var co = transformed.checkedOut;
        transformed.checkedOut = {
            comment: co.comment || null,
            collaborationEdit: co.collaborationEdit || null,
            collaborationEditType: co.collaborationEditType || null,
            checkedOutBy: co.userId || null,
            checkedOutAt: co.timestamp || null
        };
    }

    // Transform locked structure
    if (transformed.locked && typeof transformed.locked === 'object') {
        var lock = transformed.locked;
        transformed.locked = {
            comment: lock.comment || null,
            lockedBy: lock.userId || null,
            lockedAt: lock.timestamp || null
        };
    }

    return transformed;
}

function convertEmptyStringsToNull(obj) {
    if (!obj || typeof obj !== 'object') {
        return obj;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
        var result = [];
        for (var i = 0; i < obj.length; i++) {
            result.push(convertEmptyStringsToNull(obj[i]));
        }
        return result;
    }

    // Fields that should be null instead of empty string
    var nullableFields = [
        'policyId',
        'classificationId',
        'eTag'
    ];

    // Fields that should be removed for v3 API (not supported)
    var fieldsToRemove = [
        'isDeleted'  // v3 CustomAttribute doesn't have isDeleted field
    ];

    var cleaned = {};
    for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
            var value = obj[key];

            // Skip fields that should be removed
            if (fieldsToRemove.indexOf(key) !== -1) {
                continue;
            }

            // Convert empty string to null for nullable fields (check this FIRST)
            if (value === '' && nullableFields.indexOf(key) !== -1) {
                cleaned[key] = null;
            }
            // Recursively clean nested objects and arrays (check for object type, not truthiness)
            else if (value !== null && typeof value === 'object') {
                cleaned[key] = convertEmptyStringsToNull(value);
            }
            else {
                cleaned[key] = value;
            }
        }
    }

    return cleaned;
}

function applyV3Transformations(patchRequest) {
    var step1 = convertToCamelCase(patchRequest);
    var step2 = transformToV3Structure(step1);
    var step3 = convertEmptyStringsToNull(step2);

    // V3 API EnvUrl validation requires leading '/'
    // Format: /location/x/x/x/x/~timestamp.extension
    // NMD envUrl may be missing the leading slash
    if (step3.envUrl && step3.envUrl.charAt(0) !== '/') {
        step3.envUrl = '/' + step3.envUrl;
    }

    // V3 API requires cabinetId even for DELETED documents
    // For DELETED documents, containingcabs is empty, so use deletedCabinets[0]
    if (!step3.cabinetId && step3.deletedCabinets && step3.deletedCabinets.length > 0) {
        step3.cabinetId = step3.deletedCabinets[0];
    }

    // Consolidate duplicate custom attributes
    // NMD format creates separate entries for each "cp|AttributeId|N" field
    // v3 API expects a single entry per attribute with all values in the values array
    if (step3.customAttributes && Array.isArray(step3.customAttributes)) {
        var consolidated = {};
        for (var i = 0; i < step3.customAttributes.length; i++) {
            var attr = step3.customAttributes[i];
            var key = attr.key;

            if (!consolidated[key]) {
                consolidated[key] = {
                    key: key,
                    values: []
                };
            }

            // Merge values arrays
            if (attr.values && Array.isArray(attr.values)) {
                for (var j = 0; j < attr.values.length; j++) {
                    consolidated[key].values.push(attr.values[j]);
                }
            }
        }

        // Convert back to array
        step3.customAttributes = [];
        for (var key in consolidated) {
            if (consolidated.hasOwnProperty(key)) {
                step3.customAttributes.push(consolidated[key]);
            }
        }
    }

    // Fix timestamp ordering: ensure modifiedAt >= createdAt
    // Some NMD messages have modifiedAt before createdAt which fails v3 API validation
    if (step3.createdAt && step3.modifiedAt) {
        var created = new Date(step3.createdAt);
        var modified = new Date(step3.modifiedAt);
        if (modified < created) {
            // Set modifiedAt to createdAt to fix the ordering
            step3.modifiedAt = step3.createdAt;
        }
    }

    // Fix version timestamp ordering
    if (step3.versions && Array.isArray(step3.versions)) {
        for (var i = 0; i < step3.versions.length; i++) {
            var version = step3.versions[i];
            if (version.createdAt && version.modifiedAt) {
                var vCreated = new Date(version.createdAt);
                var vModified = new Date(version.modifiedAt);
                if (vModified < vCreated) {
                    version.modifiedAt = version.createdAt;
                }
            }
        }
    }

    return step3;
}


function buildAndSavePatchRequest(operationType = 'CREATE') {
    const nmdMessage = JSON.parse(pm.environment.get('nmdMessage'));
    const patchRequest = buildPatchRequest(nmdMessage, operationType);

    // Apply v3 API transformations
    const v3PatchRequest = applyV3Transformations(patchRequest);

    // For UPDATE operations, include eTag for optimistic locking
    if (operationType === 'UPDATE') {
        const currentETag = pm.environment.get('currentETag');
        if (currentETag) {
            v3PatchRequest.eTag = currentETag;
            console.log(`   Including eTag for UPDATE: ${currentETag}`);
        } else {
            console.warn('   ⚠️  No eTag found in environment for UPDATE operation');
        }
    }

    pm.environment.set('patchRequest', JSON.stringify(v3PatchRequest, null, 2));

    console.log(`✅ ${operationType} patch request built successfully`);
    console.log(`   Document: ${patchRequest.Name}`);
    console.log(`   State: ${patchRequest.State}`);
    console.log(`   Versions: ${patchRequest.Versions.length}`);
    console.log(`   ACL Entries: ${patchRequest.Acl.length}`);
    console.log(`   Custom Attributes: ${patchRequest.CustomAttributes.length}`);
    console.log(`   Linked Documents: ${patchRequest.LinkedDocuments.length}`);
    console.log(`   Parent Folders: ${patchRequest.ParentFolders.length}`);
    console.log(`   Folder Tree: ${patchRequest.FolderTree.length}`);

    if (patchRequest.Archived) {
        console.log(`   Status: ARCHIVED`);
    }
    if (patchRequest.CheckedOut.UserId) {
        console.log(`   Status: CHECKED OUT by ${patchRequest.CheckedOut.UserId}`);
    }
    if (patchRequest.Locked.UserId) {
        console.log(`   Status: LOCKED by ${patchRequest.Locked.UserId}`);
    }
    if (patchRequest.ClassificationId) {
        console.log(`   Classification: ${patchRequest.ClassificationId}`);
    }
    if (patchRequest.PolicyId) {
        console.log(`   DLP Policy: ${patchRequest.PolicyId}`);
    }
}

// ========================================================================
// EXPORT FUNCTIONS TO PM OBJECT
// ========================================================================
// Attach all functions to pm object so they're accessible in Newman
// and request-level scripts

pm.nmdTransform = {
    // Utility functions
    convertDate,
    convertModNumToISO,

    // ACL functions
    getSubjectType,
    mapRightsToRelations,
    buildAcl,

    // Version functions
    buildVersions,

    // Document state
    determineDocumentState,

    // Status flags
    extractStatusFlags,
    buildCheckedOut,
    buildLocked,

    // Custom attributes
    extractCustomAttributes,

    // Linked documents
    parseLinkedDocuments,

    // Folder hierarchy
    parseParentFolders,
    parseFolderTree,

    // DLP and Classification
    extractClassificationId,
    extractPolicyId,

    // Email metadata
    parseEmailInfo,

    // Deleted cabinets
    extractDeletedCabinets,

    // EnvUrl
    extractEnvUrl,

    // Main transformation
    buildPatchRequest,
    buildAndSavePatchRequest
};

// Also expose main helper function at top level for convenience
pm.buildAndSavePatchRequest = buildAndSavePatchRequest;

// ========================================================================
// USAGE NOTE
// ========================================================================
// These functions are now available in all request-level scripts via:
//
// Method 1 (Recommended):
//   pm.nmdTransform.buildAndSavePatchRequest('CREATE');
//
// Method 2 (Shortcut for main function):
//   pm.buildAndSavePatchRequest('CREATE');
//
// Method 3 (Access individual functions):
//   const acl = pm.nmdTransform.buildAcl(nmdMessage);
//   const versions = pm.nmdTransform.buildVersions(nmdMessage.documents['1'].versions);
// ========================================================================
