# Custom Templates UI Redesign (Feb 22, 2026)

## Overview
Redesigned the Report Template Manager UI to be more user-friendly and less technical, with clear explanations of system templates and their impact on smart recommendations.

## Key Changes

### 1. **Human-Friendly Language** ✅
- **Removed technical terms**: No more "INTAKE/ONGOING/SUMMARY" showing to users
- **Added Hebrew descriptions**:
  - INTAKE → "טופס קליטה" (Intake Form) - "למילוי בפגישה הראשונה עם המטופל"
  - ONGOING → "טופס שוטף" (Ongoing Form) - "למילוי בפגישות הטיפול המתמשכות"
  - SUMMARY → "טופס סיכום" (Summary Form) - "למילוי בסיום תהליך הטיפול"

### 2. **Functional Explanations** ✅
Each system template now includes:
- **Description**: What the form is used for
- **Details**: Why it's important and what it does functionally
- **Functional Note**: Explains how editing this template affects smart recommendations

Example:
```
טופס קליטה (Intake Form)
└─ למילוי בפגישה הראשונה עם המטופל
   משמש לאיסוף מידע רקע, מטרות ותיוחום ראשוני. המערכת ממליצה טופס זה 
   באופן אוטומטי לפגישה הראשונה.
   
   🔄 משפיע על המלצות המערכת: כל פגישה חדשה תשתמש בטופס קליטה אוטומטית.
```

### 3. **System vs. Custom Templates Separation** ✅
**Visual Separation**:
- **System Templates** (📌): Blue background, clearly marked as "חובה לתפקוד חכם" (Required for smart functionality)
- **Custom Templates** (➕): Gray background, marked as "אופציונלי" (Optional)

**Layout**:
- Left sidebar organized into two clear sections
- System templates always visible at top
- Custom templates listed below
- "Create Custom Template" button at bottom of left sidebar

### 4. **Smart Feature Protection** ✅
- ❌ Cannot delete system templates (prevents breaking smart recommendations)
- ✅ CAN rename system templates (users have flexibility)
- ✅ CAN edit system template questions (customization is allowed)
- ✅ Changes to system templates affect all future recommendations automatically

### 5. **Custom Template Clarity** ✅
- Clearly marked as "אופציונלי" (Optional)
- Note: "טופס זה משמש לשימוש נוסף ולא משפיע על הטופסים המעורכים של המערכת"
  (This form is for additional use and does not affect system templates)
- ✅ Can be deleted without any impact
- ❌ Not used in smart recommendations

### 6. **Informational UI Elements** ✅
- **Blue info box at top**: Explains the difference between system and custom templates
- **Tooltip on hover**: Each system template shows detailed information on hover
- **Amber warning box**: Shows functional impact of editing system templates
- **Icons**: Visual indicators (📌 system, ➕ custom, 🔄 affects smart features)

## Why System Templates Are Required

The smart recommendation engine works like this:

```javascript
// When a user creates a session:
if (firstSessionWithStudent) {
  suggestedTemplate = fetchTemplateByType(serviceId, 'INTAKE')  // System template
} else if (hasMultipleSessions) {
  suggestedTemplate = fetchTemplateByType(serviceId, 'ONGOING')  // System template
}
```

**If system templates are deleted**:
- The app can't find the template to recommend
- Users see no suggestions (bad UX)
- The smart feature becomes useless

**Therefore**: System templates are locked and cannot be deleted, but can be customized.

## UI Changes Made

### ReportTemplateManager.jsx

**Additions**:
- `SYSTEM_TEMPLATE_TYPES` constant with human-friendly names, descriptions, and functional notes
- `TooltipProvider` wrapper for tooltips on system templates
- Restructured template selection with two clear sections
- Informational boxes explaining system vs custom templates
- Better visual hierarchy with colors and icons

**Changes**:
- Header updated with clearer instructions and color-coded info box
- Template list reorganized with system templates prioritized
- Selected template shows contextual information about its role
- Button labels updated from "תבנית" to "טופס" (more natural language)
- "Create Custom Template" button moved and made more prominent

## User Experience Flow

1. **Select Service** → Choose which service's templates to manage
2. **See System Templates** → Blue-highlighted, with descriptions
3. **Edit or Create**:
   - **System template**: Click to edit questions/name → Changes affect smart recommendations
   - **Custom template**: Click to edit independently → No impact on smart features
4. **Create Custom**: Button at bottom allows creating new templates from any base

## Technical Implementation

- No database schema changes
- All changes are UI/UX focused
- Existing API endpoints work unchanged
- Backward compatible with existing templates

## Files Modified

- `src/components/settings/ReportTemplateManager.jsx` - Complete UI redesign

## Testing Checklist

✅ Component loads without errors
✅ All system templates display with human-friendly names
✅ Tooltips work on hover
✅ Custom templates display correctly
✅ Can edit system template questions
✅ Can rename system templates
✅ Can delete custom templates
✅ Cannot delete system templates (button disabled)
✅ Create custom template button works
✅ Info boxes display correctly
✅ Icons render properly
✅ Hebrew text displays correctly (RTL)
✅ Responsive design works on mobile

## Future Enhancements

- Add search/filter for templates when list grows
- Show usage count (how many sessions use each template)
- Allow duplicating system templates as custom templates
- Add template preview before selecting
- Show audit trail of template changes

