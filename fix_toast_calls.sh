#!/bin/bash

# 批量修复 toast 调用方式
files=(
"src/app/(app)/ide/[id]/components/parallel-editor/panels/qa-review.tsx"
"src/app/(app)/ide/[id]/components/parallel-editor/panels/suggestion-panel.tsx" 
"src/app/(app)/ide/[id]/components/menu/action-section.tsx"
"src/app/(app)/dashboard/document-intelligence/page.tsx"
"src/app/(app)/dashboard/dictionaries/components/create-dictionary-dialog.tsx"
"src/app/(app)/dashboard/dictionaries/components/edit-dictionary-dialog.tsx"
"src/app/(app)/dashboard/dictionaries/components/import-dictionary-dialog.tsx"
"src/app/(app)/dashboard/dictionaries/components/dictionary-entries-manager.tsx"
"src/app/(app)/dashboard/dictionaries/components/dictionary-artwork.tsx"
"src/app/(app)/dashboard/dictionaries/components/import-dictionary-entries-dialog.tsx"
"src/app/(app)/dashboard/dictionaries/components/add-public-dictionary-dialog.tsx"
"src/app/(app)/dashboard/dictionaries/page.tsx"
"src/app/(app)/dashboard/dictionaries/[dictionaryId]/page.tsx"
"src/app/(app)/dashboard/memories/components/import-memory-dialog.tsx"
"src/app/(app)/dashboard/memories/page.tsx"
"src/app/(app)/dashboard/memories/[memoryId]/page.tsx"
"src/app/(app)/dashboard/instant-translate/page.tsx"
"src/app/(app)/dashboard/image-intelligence/page.tsx"
"src/app/(app)/auth/login/components/countdown-button.tsx"
"src/app/(app)/ide/[id]/components/parallel-editor/rich-text/editor.tsx"
"src/components/extension/file-upload.tsx"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "Processing: $file"
        
        # 替换常见的 toast 调用模式
        # toast({ title: "message" }) -> toast.info("message")
        sed -i 's/toast({ title: "\([^"]*\)" })/toast.info("\1")/g' "$file"
        
        # toast({ title: "Error message", description: "details" }) -> toast.error("Error message: details")
        sed -i 's/toast({ title: "\([^"]*\)", description: "\([^"]*\)" })/toast.error("\1: \2")/g' "$file"
        
        # toast({ title: var }) -> toast.info(var)
        sed -i 's/toast({ title: \([^}]*\) })/toast.info(\1)/g' "$file"
        
        # toast({ title: "Success", description: var }) -> toast.success("Success: " + var)
        sed -i 's/toast({ title: "成功", description: \([^}]*\) })/toast.success("成功: " + \1)/g' "$file"
        sed -i 's/toast({ title: "Success", description: \([^}]*\) })/toast.success("Success: " + \1)/g' "$file"
        
        echo "✓ Updated: $file"
    else
        echo "✗ File not found: $file"
    fi
done

echo "Toast calls fix completed!"
