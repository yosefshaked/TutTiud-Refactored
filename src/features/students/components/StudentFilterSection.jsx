import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Search, RotateCcw, Dot } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import DayOfWeekSelect from '@/components/ui/DayOfWeekSelect.jsx';
import { STUDENT_SORT_OPTIONS } from '@/features/students/utils/sorting.js';

export function StudentFilterSection({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  dayFilter,
  onDayChange,
  instructorFilterId,
  onInstructorFilterChange,
  sortBy,
  onSortChange,
  instructors = [],
  hasActiveFilters,
  onResetFilters,
  showInstructorFilter = true, // Allow hiding instructor filter for non-admin views
}) {
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const hasAdvancedFilters = useMemo(() => {
    return dayFilter !== null || (showInstructorFilter && instructorFilterId !== '') || statusFilter !== 'active';
  }, [dayFilter, instructorFilterId, statusFilter, showInstructorFilter]);

  return (
    <div className="space-y-sm">
      {/* Basic search - always visible */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
        <Input
          type="text"
          placeholder="חיפוש לפי שם, טלפון, תעודת זהות..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pr-9 text-right"
          dir="rtl"
        />
      </div>

      {/* Advanced filters toggle */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
        className="w-full gap-2 justify-center relative"
      >
        <span>סינון מתקדם</span>
        {showAdvancedFilters ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
        {hasAdvancedFilters && !showAdvancedFilters && (
          <Dot className="absolute left-2 h-3 w-3 bg-primary rounded-full fill-primary text-primary" />
        )}
      </Button>

      {/* Advanced filters - collapsible */}
      {showAdvancedFilters && (
        <div className="animate-in fade-in slide-in-from-top-2 space-y-sm grid sm:grid-cols-2 lg:grid-cols-4 gap-sm">
          {/* Status filter */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-neutral-600 text-right">
              סטטוס
            </label>
            <Select value={statusFilter} onValueChange={onStatusChange}>
              <SelectTrigger className="text-right">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">פעילים בלבד</SelectItem>
                <SelectItem value="inactive">לא פעילים בלבד</SelectItem>
                <SelectItem value="all">הכל</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Day filter */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-neutral-600 text-right">
              יום בשבוע
            </label>
            <DayOfWeekSelect
              value={dayFilter}
              onValueChange={onDayChange}
              clearable
              placeholder="כל הימים"
            />
          </div>

          {/* Instructor filter - only shown if showInstructorFilter is true */}
          {showInstructorFilter && (
            <div className="space-y-1">
              <label className="block text-xs font-medium text-neutral-600 text-right">
                מדריך
              </label>
              <Select value={instructorFilterId} onValueChange={onInstructorFilterChange}>
                <SelectTrigger className="text-right">
                  <SelectValue placeholder="כל המדריכים" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">כל המדריכים</SelectItem>
                  {instructors.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.name || inst.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Sort option */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-neutral-600 text-right">
              מיין לפי
            </label>
            <Select value={sortBy} onValueChange={onSortChange}>
              <SelectTrigger className="text-right">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={STUDENT_SORT_OPTIONS.SCHEDULE}>לוח זמנים</SelectItem>
                <SelectItem value={STUDENT_SORT_OPTIONS.NAME}>שם</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Reset filters button */}
          {hasActiveFilters && (
            <div className="flex items-end">
              <Button
                variant="outline"
                size="sm"
                onClick={onResetFilters}
                className="w-full gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                איפוס סינונים
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
