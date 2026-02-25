# Preconfigured Answers - Quick Test Guide

## Feature Overview
Users can now export preconfigured answers from any question and import them to any other question. Each export is **per-question** (not all questions), making it simple and portable across different forms.

## Quick Start

### How to Export
1. Go to **Settings → Manage Session Form Questions**
2. Find a question with preconfigured answers
3. Click the **"ייצוא/ייבוא"** button at the top
4. Click the **"Export"** tab
5. Click **"Copy"** or **"Download"** next to any question
   - Filename will include the question label, e.g., `"מצב הרוח-2025-02-25.json"`

### How to Import
1. Go to **Settings → Manage Session Form Questions**
2. Click **"ייצוא/ייבוא"** button
3. Click **"Import"** tab
4. Choose one of three options:
   - **Upload JSON file** (drag or click to select)
   - **Paste from clipboard** (auto-detect)
   - **Manually paste JSON** (in text box, then click "Load")
5. After loading, you'll see:
   - ✅ Green banner: "Imported 5 answers"
   - 📝 Label: "From question: [original question name]"
6. Choose target question from dropdown
7. Click **"Import to selected question"**
8. Done! Answers merged into selected question

## Test Scenarios

### Scenario 1: Simple Export
**Goal**: Export answers from a question

**Steps**:
1. Go to Settings → Session Form Questions
2. Click "ייצוא/ייבוא"
3. Click "Export" tab
4. See list of questions with answers
5. Click "Download" button next to a question
6. File should download with name like `"שאלה_1-2025-02-25.json"`

**Expected Result**:
- ✅ File downloads successfully
- ✅ Filename includes question label
- ✅ File contains valid JSON

---

### Scenario 2: Copy to Clipboard
**Goal**: Copy answers to clipboard for sharing

**Steps**:
1. Go to Settings → Session Form Questions
2. Click "ייצוא/ייבוא"
3. Click "Export" tab
4. Click "Copy" button (clipboard icon)
5. You should see toast: "Copied to clipboard"
6. Paste into text editor (Ctrl+V)

**Expected Result**:
- ✅ Toast shows "Copied to clipboard"
- ✅ Clipboard contains valid JSON
- ✅ Button shows checkmark for 2 seconds

---

### Scenario 3: Import from File
**Goal**: Import answers from a downloaded file

**Setup**: Have a JSON file from export (or manually created)

**Steps**:
1. Go to Settings → Session Form Questions
2. Click "ייצוא/ייבוא"
3. Click "Import" tab
4. Click on the dashed upload area
5. Select a JSON file
6. Should see green success: "Loaded successfully"
7. Select target question from dropdown
8. Click "Import to selected question"

**Expected Result**:
- ✅ File uploads successfully
- ✅ Green banner shows answer count
- ✅ Shows "From question: [label]"
- ✅ Dropdown populated with available questions
- ✅ Import saves to target question
- ✅ Toast: "X answers imported to [question name]"

---

### Scenario 4: Paste from Clipboard
**Goal**: Import answers directly from clipboard

**Setup**: Have JSON in clipboard (from export or copied elsewhere)

**Steps**:
1. Copy JSON to clipboard (e.g., from previous export)
2. Go to Settings → Session Form Questions
3. Click "ייצוא/ייבוא"
4. Click "Import" tab
5. Click "Paste from clipboard" button
6. Should load and show success banner
7. Select target question
8. Click "Import"

**Expected Result**:
- ✅ Loads data from clipboard automatically
- ✅ Shows success with answer count
- ✅ Successfully imports to selected question

---

### Scenario 5: Manual Paste
**Goal**: Paste JSON directly into text area

**Setup**: Have JSON text

**Steps**:
1. Go to Settings → Session Form Questions
2. Click "ייצוא/ייבוא"
3. Click "Import" tab
4. Paste JSON into text box
5. Click "Load data"
6. Select target question
7. Click "Import"

**Expected Result**:
- ✅ Text parses correctly
- ✅ Shows success banner
- ✅ Imports to selected question

---

### Scenario 6: Merge Existing Answers
**Goal**: Import answers merge with existing ones (no duplicates)

**Setup**: 
- Question has answers: ["A", "B", "C"]
- Import has answers: ["B", "C", "D", "E"]

**Expected Result** after import:
- Question should have: ["A", "B", "C", "D", "E"]
- Duplicates "B" and "C" not added twice
- ✅ Toast shows "4 answers imported" (B, C already exist)

---

### Scenario 7: Error Handling
**Goal**: Test error messages

**Test Cases**:

#### Invalid JSON
1. Paste: `{ invalid json without closing`
2. Should show error: "Invalid JSON syntax"

#### Missing answers field
1. Paste: `{ "version": "1.0", "question": { "label": "test" } }`
2. Should show error: "Invalid format: missing or invalid 'answers' field"

#### Non-array answers
1. Paste: `{ "version": "1.0", "question": { "label": "test" }, "answers": "string" }`
2. Should show error: "Invalid format: answers must be an array"

#### Wrong file type
1. Try to upload a .txt or .pdf file
2. Should reject or show error

---

## JSON File Format Reference

### Valid Export File
```json
{
  "version": "1.0",
  "exportedAt": "2025-02-25T10:30:00.000Z",
  "question": {
    "id": "abc123def456",
    "label": "מצב הרוח"
  },
  "answers": [
    "טוב מאוד",
    "טוב",
    "בסדר",
    "לא טוב"
  ]
}
```

### What Each Field Means
- **version**: Export format version (currently 1.0)
- **exportedAt**: ISO timestamp when file was created
- **question.id**: Question's unique ID (informational)
- **question.label**: Human-readable question name (shown in import)
- **answers**: Array of answer strings

---

## Common Issues & Solutions

### Issue: "Invalid format" error
**Solution**: Make sure JSON is valid. Use an online JSON validator.

### Issue: No questions showing in export
**Solution**: Questions must be of type "text" or "textarea" and have answers.

### Issue: Target question dropdown empty
**Solution**: Form must have at least one text/textarea question.

### Issue: Answers not saving
**Solution**: Check that you clicked "Import to selected question" and saw success toast.

---

## Tips & Tricks

💡 **Copy between forms easily**: Export from Form A, import to Form B - works because you select the target question manually.

💡 **Backup answers**: Download JSON files with descriptive names like `"mood-questions-backup.json"`.

💡 **Share within team**: Copy JSON and paste it to slack/email, team members can import it.

💡 **No ID conflicts**: Questions are identified by their labels, not IDs, so it works across different forms.

---

## Expected Behavior Checklist

### Export Tab
- [x] Shows only text/textarea questions
- [x] Only shows questions with answers
- [x] Shows answer count for each
- [x] Copy button works
- [x] Download button works
- [x] Filename includes question label
- [x] Filename includes today's date

### Import Tab
- [x] File upload accepts .json files
- [x] Can paste from clipboard (button)
- [x] Can manually paste JSON (text area)
- [x] Invalid JSON shows error
- [x] Valid import shows green banner
- [x] Banner shows answer count
- [x] Banner shows original question label
- [x] Dropdown shows available questions
- [x] Import button disabled until question selected
- [x] After import: question updated, dialog closes, toast shown

### Overall
- [x] Answers deduped (no duplicates)
- [x] Answer cap enforced (max 50)
- [x] Merging preserves existing answers
- [x] Database saves correctly
- [x] Settings page reflects new answers

---

**Happy Testing!** 🎉
