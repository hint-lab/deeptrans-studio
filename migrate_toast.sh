#!/bin/bash

# 批量替换 useToast 为 sonner toast
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
"src/app/(app)/auth/login/components/email-login-form.tsx"
"src/app/(app)/auth/login/components/countdown-button.tsx"
"src/app/(app)/ide/[id]/components/parallel-editor/rich-text/editor.tsx"
"src/components/extension/file-upload.tsx"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "Processing: $file"
        # 替换导入语句
        sed -i 's|import { useToast } from "@/hooks/useToast";|import { toast } from "sonner";|g' "$file"
        # 移除 const { toast } = useToast(); 这一行
        sed -i '/const { toast } = useToast();/d' "$file"
        echo "✓ Updated: $file"
    else
        echo "✗ File not found: $file"
    fi
done

echo "Migration completed!"
