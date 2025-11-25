import React, { useCallback, useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, ChevronLeft, AlertCircle, CheckCircle2 } from 'lucide-react';
import { authenticatedFetch } from '@/lib/api-client';
import { fetchSettingsValue } from '@/features/settings/api/settings.js';
import InstructorDocumentsSection from '../InstructorDocumentsSection.jsx';

const REQUEST = { idle: 'idle', loading: 'loading', error: 'error' };

export default function DocumentCenterView({ session, orgId, canLoad }) {
  const [instructors, setInstructors] = useState([]);
  const [definitions, setDefinitions] = useState([]);
  const [loadState, setLoadState] = useState(REQUEST.idle);
  const [loadError, setLoadError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInstructor, setSelectedInstructor] = useState(null);

  const loadAll = useCallback(async () => {
    if (!canLoad) {
      setInstructors([]);
      setDefinitions([]);
      return;
    }
    setLoadState(REQUEST.loading);
    setLoadError('');
    try {
      const params = new URLSearchParams({ org_id: orgId, include_inactive: 'true' });
      const [roster, settingsData] = await Promise.all([
        authenticatedFetch(`instructors?${params.toString()}`, { session }),
        fetchSettingsValue({ session, orgId, key: 'instructor_document_definitions' }),
      ]);
      
      setInstructors(Array.isArray(roster) ? roster : []);
      setDefinitions(Array.isArray(settingsData?.value) ? settingsData.value : []);
      setLoadState(REQUEST.idle);
    } catch (error) {
      console.error('Failed to load data', error);
      setLoadError(error?.message || 'טעינת הנתונים נכשלה.');
      setLoadState(REQUEST.error);
      setInstructors([]);
      setDefinitions([]);
    }
  }, [canLoad, orgId, session]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSelectInstructor = (instructor) => {
    setSelectedInstructor(instructor);
  };

  const handleBack = () => {
    setSelectedInstructor(null);
  };

  const isLoading = loadState === REQUEST.loading;

  const filteredInstructors = instructors.filter((instructor) => {
    const query = searchQuery.toLowerCase();
    const name = (instructor.name || '').toLowerCase();
    const email = (instructor.email || '').toLowerCase();
    return name.includes(query) || email.includes(query);
  });

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  // Calculate document status for each instructor
  const getDocumentStatus = (instructor) => {
    const instructorType = instructor?.instructor_type;
    const instructorFiles = Array.isArray(instructor?.files) ? instructor.files : [];
    
    // Filter definitions relevant to this instructor
    const relevantDefinitions = definitions.filter(def => {
      if (!def.target_instructor_types || def.target_instructor_types.length === 0) return true;
      if (!instructorType) return false;
      return def.target_instructor_types.includes(instructorType);
    });

    const mandatoryDefs = relevantDefinitions.filter(d => d.is_mandatory);
    const uploadedDefIds = new Set(
      instructorFiles.filter(f => f.definition_id).map(f => f.definition_id)
    );

    const missingMandatory = mandatoryDefs.filter(d => !uploadedDefIds.has(d.id));

    return {
      totalRequired: mandatoryDefs.length,
      completed: mandatoryDefs.length - missingMandatory.length,
      hasMissing: missingMandatory.length > 0,
    };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="mr-3 text-sm text-slate-600">טוען נתונים...</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
        {loadError}
      </div>
    );
  }

  // Detail View
  if (selectedInstructor) {
    return (
      <div className="space-y-6" dir="rtl">
        <div className="flex items-center gap-3 mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            חזרה לרשימה
          </Button>
        </div>

        <div className="flex items-center gap-4 p-4 border rounded-lg bg-slate-50">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="bg-purple-100 text-purple-700 text-xl">
              {getInitials(selectedInstructor.name || selectedInstructor.email)}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="font-semibold text-lg">
              {selectedInstructor.name || selectedInstructor.email}
            </div>
            <div className="text-sm text-muted-foreground">
              {selectedInstructor.email}
            </div>
          </div>
        </div>

        <InstructorDocumentsSection
          instructor={selectedInstructor}
          session={session}
          orgId={orgId}
          onRefresh={loadAll}
        />
      </div>
    );
  }

  // List View
  return (
    <div className="space-y-4" dir="rtl">
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="חיפוש לפי שם או אימייל..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pr-10"
          dir="rtl"
        />
      </div>

      {filteredInstructors.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">
          {searchQuery ? 'לא נמצאו תוצאות' : 'אין מדריכים להצגה'}
        </p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {filteredInstructors.map((instructor) => {
            const status = getDocumentStatus(instructor);
            return (
              <div
                key={instructor.id}
                className="flex items-center justify-between gap-4 p-4 border rounded-lg bg-white hover:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => handleSelectInstructor(instructor)}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-purple-100 text-purple-700">
                      {getInitials(instructor.name || instructor.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {instructor.name || instructor.email || instructor.id}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {instructor.email || '—'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {status.totalRequired > 0 && (
                    <div className="flex items-center gap-1.5">
                      {status.hasMissing ? (
                        <>
                          <AlertCircle className="h-4 w-4 text-amber-600" />
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                            {status.completed}/{status.totalRequired}
                          </Badge>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                            הושלם
                          </Badge>
                        </>
                      )}
                    </div>
                  )}
                  <ChevronLeft className="h-5 w-5 text-muted-foreground" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
