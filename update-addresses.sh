#!/bin/bash

# Old addresses
OLD_MEME_FACTORY="0x0eeF9597a9B231b398c29717e2ee89eF6962b784"
OLD_STAKING="0x3e3EeE193b0F4eae15b32B1Ee222B6B8dFC17ECa"
OLD_PLATFORM_TOKEN="0x26EfC13dF039c6B4E084CEf627a47c348197b655"

# New addresses
NEW_MEME_FACTORY="0x0eeF9597a9B231b398c29717e2ee89eF6962b784"
NEW_STAKING="0x3e3EeE193b0F4eae15b32B1Ee222B6B8dFC17ECa"
NEW_PLATFORM_TOKEN="0x26EfC13dF039c6B4E084CEf627a47c348197b655"

echo "Updating contract addresses across the project..."

# Find and replace in all files (excluding node_modules, .git, and build directories)
find . -type f \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -not -path "*/dist/*" \
  -not -path "*/build/*" \
  -not -path "*/artifacts/*" \
  -not -path "*/cache/*" \
  -not -path "*.backup.*" \
  \( -name "*.ts" -o -name "*.js" -o -name "*.json" -o -name "*.env" -o -name "*.md" -o -name "*.yml" -o -name "*.yaml" -o -name "*.sh" \) \
  -exec grep -l "$OLD_MEME_FACTORY\|$OLD_STAKING\|$OLD_PLATFORM_TOKEN" {} \; | while read file; do
    echo "Updating: $file"
    
    # Use sed to replace addresses
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/$OLD_MEME_FACTORY/$NEW_MEME_FACTORY/g" "$file"
        sed -i '' "s/$OLD_STAKING/$NEW_STAKING/g" "$file"
        sed -i '' "s/$OLD_PLATFORM_TOKEN/$NEW_PLATFORM_TOKEN/g" "$file"
    else
        # Linux
        sed -i "s/$OLD_MEME_FACTORY/$NEW_MEME_FACTORY/g" "$file"
        sed -i "s/$OLD_STAKING/$NEW_STAKING/g" "$file"
        sed -i "s/$OLD_PLATFORM_TOKEN/$NEW_PLATFORM_TOKEN/g" "$file"
    fi
done

echo "✅ Address update complete!"
echo ""
echo "New addresses:"
echo "  MemeFactory: $NEW_MEME_FACTORY"
echo "  Staking: $NEW_STAKING"
echo "  Platform Token: $NEW_PLATFORM_TOKEN"