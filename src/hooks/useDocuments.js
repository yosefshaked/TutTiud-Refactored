/**
 * useDocuments Hook - Unified document management for students, instructors, organizations
 * Fetches documents from Documents table via /api/documents endpoint
 * Replaces prop-based file arrays from Students.files, Instructors.files
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useOrg } from '@/org/OrgContext.jsx';

export function useDocuments(entityType, entityId) {
  const { session } = useAuth();
  const { activeOrgId } = useOrg();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * Fetch documents for the entity
   */
  const fetchDocuments = useCallback(async () => {
    console.log('[DEBUG-FRONTEND] useDocuments fetchDocuments called', {
      entityType,
      entityId,
      activeOrgId,
      hasSession: !!session?.access_token
    });

    if (!session?.access_token || !activeOrgId || !entityId) {
      console.warn('[WARN-FRONTEND] useDocuments: Missing required context', {
        hasToken: !!session?.access_token,
        hasOrgId: !!activeOrgId,
        hasEntityId: !!entityId
      });
      setDocuments([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const url = `/api/documents?entity_type=${entityType}&entity_id=${entityId}&org_id=${activeOrgId}`;
      console.log('[DEBUG-FRONTEND] Fetching documents from:', url);
      console.log('[DEBUG-FRONTEND] Request headers:', {
        hasAuth: !!session?.access_token,
        tokenLength: session?.access_token?.length || 0
      });

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'X-Supabase-Authorization': `Bearer ${session.access_token}`,
          'x-supabase-authorization': `Bearer ${session.access_token}`,
          'x-supabase-auth': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('[DEBUG-FRONTEND] Response received:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        contentType: response.headers.get('content-type'),
        contentLength: response.headers.get('content-length'),
        headers: Object.fromEntries(response.headers.entries())
      });

      if (!response.ok) {
        console.error('[ERROR-FRONTEND] Response not OK, reading error...');
        let errorData;
        try {
          const text = await response.text();
          console.log('[DEBUG-FRONTEND] Error response text:', text);
          errorData = text ? JSON.parse(text) : {};
          console.log('[DEBUG-FRONTEND] Parsed error data:', errorData);
        } catch (parseError) {
          console.error('[ERROR-FRONTEND] Failed to parse error response:', parseError);
          errorData = {};
        }
        throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
      }

      console.log('[DEBUG-FRONTEND] Parsing success response...');
      // Read response text first to debug empty body issue
      const responseText = await response.text();
      console.log('[DEBUG-FRONTEND] Response text received:', {
        length: responseText.length,
        preview: responseText.substring(0, 200),
        isEmpty: responseText.length === 0
      });

      if (!responseText || responseText.length === 0) {
        console.warn('[WARN-FRONTEND] Response body is empty despite 200 status');
        setDocuments([]);
        return;
      }

      const data = JSON.parse(responseText);
      console.log('[DEBUG-FRONTEND] Documents data received:', {
        hasDocuments: !!data.documents,
        documentCount: data.documents?.length || 0,
        firstDocument: data.documents?.[0]?.name || 'none'
      });

      setDocuments(data.documents || []);
    } catch (err) {
      console.error('[ERROR-FRONTEND] Documents fetch error:', {
        message: err.message,
        stack: err.stack
      });
      setError(err.message);
      setDocuments([]);
    } finally {
      setLoading(false);
      console.log('[DEBUG-FRONTEND] fetchDocuments completed');
    }
  }, [session?.access_token, activeOrgId, entityType, entityId]);

  /**
   * Upload a new document
   */
  const uploadDocument = useCallback(async (file, metadata = {}) => {
    if (!session?.access_token || !activeOrgId || !entityId) {
      throw new Error('Missing authentication or context');
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('entity_type', entityType);
    formData.append('entity_id', entityId);
    formData.append('org_id', activeOrgId);

    if (metadata.custom_name) {
      formData.append('custom_name', metadata.custom_name);
    }
    if (metadata.relevant_date) {
      formData.append('relevant_date', metadata.relevant_date);
    }
    if (metadata.expiration_date) {
      formData.append('expiration_date', metadata.expiration_date);
    }
    if (metadata.definition_id) {
      formData.append('definition_id', metadata.definition_id);
    }

    const response = await fetch('/api/documents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'X-Supabase-Authorization': `Bearer ${session.access_token}`,
        'x-supabase-authorization': `Bearer ${session.access_token}`,
        'x-supabase-auth': `Bearer ${session.access_token}`
      },
      body: formData
    });

    if (!response.ok) {
      let errorData;
      try {
        const text = await response.text();
        errorData = text ? JSON.parse(text) : {};
      } catch {
        errorData = {};
      }
      throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    
    // Refresh documents list
    await fetchDocuments();
    
    return data.file;
  }, [session?.access_token, activeOrgId, entityType, entityId, fetchDocuments]);

  /**
   * Update document metadata
   */
  const updateDocument = useCallback(async (documentId, updates) => {
    if (!session?.access_token || !activeOrgId) {
      throw new Error('Missing authentication or context');
    }

    const response = await fetch(`/api/documents/${documentId}?org_id=${activeOrgId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'X-Supabase-Authorization': `Bearer ${session.access_token}`,
        'x-supabase-authorization': `Bearer ${session.access_token}`,
        'x-supabase-auth': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updates)
    });

    if (!response.ok) {
      let errorData;
      try {
        const text = await response.text();
        errorData = text ? JSON.parse(text) : {};
      } catch {
        errorData = {};
      }
      throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
    }

    // Refresh documents list
    await fetchDocuments();
  }, [session?.access_token, activeOrgId, fetchDocuments]);

  /**
   * Delete a document
   */
  const deleteDocument = useCallback(async (documentId) => {
    if (!session?.access_token || !activeOrgId) {
      throw new Error('Missing authentication or context');
    }

    const response = await fetch(`/api/documents/${documentId}?org_id=${activeOrgId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'X-Supabase-Authorization': `Bearer ${session.access_token}`,
        'x-supabase-authorization': `Bearer ${session.access_token}`,
        'x-supabase-auth': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      let errorData;
      try {
        const text = await response.text();
        errorData = text ? JSON.parse(text) : {};
      } catch {
        errorData = {};
      }
      throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
    }

    // Refresh documents list
    await fetchDocuments();
  }, [session?.access_token, activeOrgId, fetchDocuments]);

  /**
   * Get download URL for a document
   */
  const getDownloadUrl = useCallback(async (documentId) => {
    if (!session?.access_token || !activeOrgId) {
      throw new Error('Missing authentication or context');
    }

    const response = await fetch(
      `/api/documents-download?document_id=${documentId}&org_id=${activeOrgId}`,
      {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'X-Supabase-Authorization': `Bearer ${session.access_token}`,
          'x-supabase-authorization': `Bearer ${session.access_token}`,
          'x-supabase-auth': `Bearer ${session.access_token}`
        }
      }
    );

    if (!response.ok) {
      let errorData;
      try {
        const text = await response.text();
        errorData = text ? JSON.parse(text) : {};
      } catch {
        errorData = {};
      }
      throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data;
  }, [session?.access_token, activeOrgId]);

  // Auto-fetch on mount and when dependencies change
  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  return {
    documents,
    loading,
    error,
    fetchDocuments,
    uploadDocument,
    updateDocument,
    deleteDocument,
    getDownloadUrl
  };
}
