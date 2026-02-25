# Preconfigured Answers Export/Import - Per-Question Architecture

## Summary
Refactored the preconfigured answers export/import system from a complex multi-question map model to a simple, user-friendly per-question model. Each export contains answers for exactly one question, eliminating ID mapping complexity when moving between forms.

## Problem Solved
**Initial Approach (Abandoned)**: 
- Exported all questions' answers as a map: `{ questionId1: string[], questionId2: string[], ... }`
- When importing into different form with different question IDs, required complex mapping logic
- No context about which answers came from which question
- Users had to manually map IDs if moving between different form versions

**New Approach**:
- Export answers for ONE question with its label in the filename
- Import dialog asks user "Which question should these answers go to?"
- No ID mapping needed - users just select the target question
- Filename includes human-readable question label for context

## Files Modified

### 1. `src/features/sessions/utils/preanswers-export-import.js` (REFACTORED)
**Changes:**
- `exportAnswersAsJSON(answers, question)`: Now takes question object with { id, label }
  - Returns: `{ version, exportedAt, question: { id, label }, answers: [] }`
  - Per-question focus: exports single question's answers
  
- `importAnswersFromJSON(jsonString)`: Validates simple array instead of map
  - Returns: `{ success, data: string[], questionLabel, error }`
  - No mapping logic needed
  
- `generateExportFilename(questionLabel)`: Uses question label directly
  - Format: `"question-label-YYYY-MM-DD.json"`
  - Example: `"מצב הרוח-2025-02-25.json"`

- Removed: `mergeAnswers()` function (no longer needed for per-question model)

- Kept Unchanged:
  - `downloadJSON(jsonString, filename)` - Browser download trigger
  - `copyToClipboard(text)` - Copy to clipboard
  - `pasteFromClipboard()` - Paste from clipboard

### 2. `src/features/sessions/components/PreanswersPickerDialog.jsx` (UPDATED)
**Changes:**
- `handleExportLegacy()` now calls per-question export:
  ```javascript
  const json = exportAnswersAsJSON(answers, { label: questionLabel });
  const filename = generateExportFilename(questionLabel);
  ```
- Exports single question's answers with question title in filename
- Maintains legacy support for migrating from old form settings

### 3. `src/features/sessions/components/PreanswersImportExportDialog.jsx` (COMPLETELY REDESIGNED)
**Changes:**
- **Export Tab**: Shows list of all text/textarea questions that have preconfigured answers
  - Each question card shows: question label, answer count
  - Action buttons: Copy to clipboard, Download as JSON
  - Question title automatically included in filename
  
- **Import Tab**: Three import options
  1. File upload: Select JSON file
  2. Paste from clipboard: Auto-detect and parse
  3. Manual paste: Paste JSON text and parse
  
- **Key Feature**: After importing data, shows:
  - "Imported from question: [label]" (green banner with confirmation count)
  - Dropdown selector: "Choose target question"
  - Button: "Import to selected question"
  
- **Merging Logic**: Dialog handles merging imported answers with existing ones
  - Deduplicates answers
  - Enforces preconfigured answers cap (50 per question)
  - Only updates the selected target question

### 4. `src/components/settings/SessionFormManager.jsx` (UPDATED)
**Changes:**
- `handleImportPreconfiguredAnswers(importedMap)`: Simplified handler
  - Now receives the merged preanswersMap from dialog (not raw import data)
  - Dialog handles all the import logic and merging
  - Handler just saves the updated map to database
  
- Dialog Props Updated:
  ```javascript
  <PreanswersImportExportDialog
    open={importExportDialogOpen}
    onClose={() => setImportExportDialogOpen(false)}
    currentAnswers={preanswersMap}
    onImport={handleImportPreconfiguredAnswers}
    questions={questions}  // ← NEW: Pass questions array
  />
  ```

## Architecture Decision: Per-Question Model

### Why This is Better
1. **No ID Complexity**: Users don't need to manage question IDs
2. **Portable**: Files work with any form that has text/textarea questions
3. **User-Friendly**: Question titles in filenames make context clear
4. **Simple Logic**: Export/import handles only one question at a time
5. **No Mistakes**: Dialog asks "which question?" preventing wrong merges

### Export Flow
```
User clicks "Export" on question in SessionFormManager
  ↓
PreanswersImportExportDialog export tab shows question list
  ↓
User selects a question with answers
  ↓
exportAnswersAsJSON(answers, question) creates JSON with:
  { version, exportedAt, question: { id, label }, answers: [] }
  ↓
Filename: "question-label-YYYY-MM-DD.json"
  ↓
User downloads or copies to clipboard
```

### Import Flow
```
User chooses file/paste/clipboard in import tab
  ↓
importAnswersFromJSON() validates and returns:
  { success, data: string[], questionLabel, error }
  ↓
Dialog shows green banner: "Imported from question: [label]"
  ↓
User selects target question from dropdown
  ↓
Dialog merges: existing + imported (deduped, capped at 50)
  ↓
User clicks "Import to selected question"
  ↓
onImport(mergedPreanswersMap) called
  ↓
SessionFormManager saves merged map to database
```

## Data Format Examples

### Export JSON (Per-Question)
```json
{
  "version": "1.0",
  "exportedAt": "2025-02-25T10:30:00.000Z",
  "question": {
    "id": "abc123",
    "label": "מצב הרוח"
  },
  "answers": [
    "טוב מאוד",
    "טוב",
    "בסדר",
    "לא טוב",
    "גרוע מאוד"
  ]
}
```

### Filename Format
- `"מצב הרוח-2025-02-25.json"` (Hebrew label with date)
- `"question-label-2025-02-25.json"` (English label with date)

## Testing Checklist

### Export Functionality
- [ ] Legacy modal can export from single question (PreanswersPickerDialog)
- [ ] Exported filename includes question label
- [ ] JSON structure is valid per-question format
- [ ] Copy to clipboard works
- [ ] Download as JSON works

### Import Functionality
- [ ] File upload accepts JSON files
- [ ] Paste from clipboard works
- [ ] Manual paste field works
- [ ] Invalid JSON shows error message
- [ ] Valid JSON shows green success banner with answer count
- [ ] Imported question label displays correctly

### Target Selection & Merge
- [ ] Dropdown shows only text/textarea questions
- [ ] Selected question displays with label
- [ ] Merge logic deduplicates answers
- [ ] Merge respects preconfigured answer cap (50)
- [ ] Dialog closes after successful import
- [ ] Toast shows success message

### Database Save
- [ ] Imported answers saved to database
- [ ] Existing answers not overwritten, merged correctly
- [ ] Settings updated with preconfigured_answers metadata

## Backward Compatibility
- Legacy export from PreanswersPickerDialog uses new per-question format
- Old multi-question JSON files won't import (will show error)
- This is acceptable as feature is new; no legacy data exists

## Benefits
✅ **Simpler**: No mapping between question IDs  
✅ **Portable**: Works across different form versions  
✅ **User-Friendly**: Question labels in filenames  
✅ **Clear**: Dialog shows source question and asks for target  
✅ **Safe**: Merging logic is transparent and visible  
✅ **Maintainable**: Less code, clearer intent  

## Build Status
✅ **Build**: Successful (npm run build)  
✅ **Linting**: All files pass ESLint  
✅ **No Errors**: Type checking and syntax validation passed  

## Related Features (Unchanged)
- **PreconfiguredAnswersDrawer**: Still supports "copy from question" feature
  - Users can still copy answers from other questions within same form
  - Uses same utilities, no changes needed
- **SessionFormManager**: Overall settings management unchanged
  - Import/export dialog is just one feature
  - Save/validate flows unchanged

---

**Completed**: February 25, 2025  
**Status**: Ready for Testing  
**Scope**: Per-question export/import architecture fully implemented
