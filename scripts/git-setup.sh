#!/bin/bash

# Git Repository Setup Script for Core Meme Platform

echo "🚀 Setting up Git repository for Core Meme Platform..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo -e "${RED}Git is not installed. Please install git first.${NC}"
    exit 1
fi

# Check if already a git repository
if [ -d .git ]; then
    echo -e "${YELLOW}Already a git repository. Skipping init.${NC}"
else
    # Initialize git repository
    echo "Initializing git repository..."
    git init
    echo -e "${GREEN}✓ Git repository initialized${NC}"
fi

# Set up commit message template
echo "Setting up commit message template..."
git config --local commit.template .gitmessage
echo -e "${GREEN}✓ Commit message template configured${NC}"

# Configure git settings
echo "Configuring git settings..."
git config --local core.autocrlf input
git config --local core.ignorecase false
git config --local pull.rebase false
git config --local init.defaultBranch main

# Set up git hooks directory
mkdir -p .git/hooks

# Create pre-commit hook for linting
echo "Creating pre-commit hook..."
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
# Pre-commit hook for Core Meme Platform

echo "Running pre-commit checks..."

# Run linting on staged TypeScript files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx)$')

if [ -n "$STAGED_FILES" ]; then
    echo "Linting TypeScript files..."
    pnpm lint:staged $STAGED_FILES
    if [ $? -ne 0 ]; then
        echo "❌ Linting failed. Please fix errors before committing."
        exit 1
    fi
fi

# Check for sensitive data
echo "Checking for sensitive data..."
if git diff --cached | grep -E "(private_key|secret_key|api_key|password|PRIVATE_KEY|SECRET|PASSWORD)" | grep -v ".env.example"; then
    echo "❌ WARNING: Possible sensitive data detected in commit!"
    echo "Please review your changes and ensure no secrets are being committed."
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "✅ Pre-commit checks passed"
EOF

chmod +x .git/hooks/pre-commit
echo -e "${GREEN}✓ Pre-commit hook created${NC}"

# Create commit-msg hook for conventional commits
echo "Creating commit-msg hook..."
cat > .git/hooks/commit-msg << 'EOF'
#!/bin/bash
# Commit message hook for conventional commits

commit_regex='^(feat|fix|docs|style|refactor|perf|test|chore|build|ci|revert)(\(.+\))?: .{1,50}'

if ! grep -qE "$commit_regex" "$1"; then
    echo "❌ Invalid commit message format!"
    echo "Commit message must follow conventional commits format:"
    echo "  <type>(<scope>): <subject>"
    echo ""
    echo "Examples:"
    echo "  feat: add new trading feature"
    echo "  fix(bot): resolve alert notification issue"
    echo "  docs: update README with setup instructions"
    echo ""
    echo "Types: feat, fix, docs, style, refactor, perf, test, chore, build, ci, revert"
    exit 1
fi
EOF

chmod +x .git/hooks/commit-msg
echo -e "${GREEN}✓ Commit-msg hook created${NC}"

# Create .gitattributes file
echo "Creating .gitattributes file..."
cat > .gitattributes << 'EOF'
# Auto detect text files and perform LF normalization
* text=auto

# Explicitly declare text files
*.ts text
*.tsx text
*.js text
*.jsx text
*.json text
*.md text
*.yml text
*.yaml text
*.toml text
*.sol text

# Declare files that will always have LF line endings on checkout
*.sh text eol=lf

# Declare files that will always have CRLF line endings on checkout
*.bat text eol=crlf

# Denote all files that are truly binary and should not be modified
*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.ico binary
*.pdf binary
*.woff binary
*.woff2 binary
EOF
echo -e "${GREEN}✓ .gitattributes created${NC}"

# Stage initial files
echo "Staging initial files..."
git add .gitignore
git add .gitattributes
git add .gitmessage
git add README.md
git add package.json
git add pnpm-workspace.yaml
git add docker-compose.yml

echo -e "${GREEN}✓ Initial files staged${NC}"

# Display status
echo ""
echo "📊 Repository Status:"
git status --short

echo ""
echo -e "${GREEN}✅ Git setup complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Review staged files: git status"
echo "2. Make initial commit: git commit -m \"feat: initial commit\""
echo "3. Add remote origin: git remote add origin <your-repo-url>"
echo "4. Push to remote: git push -u origin main"
echo ""
echo "Commit format: <type>(<scope>): <subject>"
echo "Example: feat(bot): add subscription management"