# Git Workflow & Version Control Strategy

## 🌳 Branch Structure

```
main (production)
├── develop (staging)
│   ├── feature/subscription-system
│   ├── feature/payment-integration  
│   ├── fix/websocket-channels
│   └── hotfix/critical-bug
```

### Branch Types

- **main** - Production-ready code, deployed to mainnet
- **develop** - Integration branch for features, deployed to testnet
- **feature/** - New features (from develop)
- **fix/** - Bug fixes (from develop)
- **hotfix/** - Critical production fixes (from main)
- **release/** - Release preparation (from develop)

## 📝 Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types
- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, semicolons, etc)
- **refactor**: Code refactoring
- **perf**: Performance improvements
- **test**: Adding tests
- **chore**: Maintenance tasks
- **build**: Build system changes
- **ci**: CI configuration changes
- **revert**: Reverting a previous commit

### Examples
```bash
feat(bot): add subscription management system
fix(websocket): resolve channel naming mismatch
docs: update payment integration guide
chore(deps): upgrade ethers to v6.9.0
```

## 🔄 Workflow

### 1. Starting a New Feature
```bash
# Update develop branch
git checkout develop
git pull origin develop

# Create feature branch
git checkout -b feature/payment-integration

# Work on feature
git add .
git commit -m "feat(payment): add crypto payment handler"

# Push feature branch
git push origin feature/payment-integration
```

### 2. Creating a Pull Request
```bash
# Update with latest develop
git checkout develop
git pull origin develop
git checkout feature/payment-integration
git rebase develop

# Push updates
git push origin feature/payment-integration --force-with-lease

# Create PR on GitHub/GitLab
```

### 3. Hotfix for Production
```bash
# Create hotfix from main
git checkout main
git pull origin main
git checkout -b hotfix/critical-security-fix

# Make fix
git add .
git commit -m "fix(security): patch SQL injection vulnerability"

# Merge to main AND develop
git checkout main
git merge hotfix/critical-security-fix
git push origin main

git checkout develop
git merge hotfix/critical-security-fix
git push origin develop
```

## 🏷️ Version Tagging

We use [Semantic Versioning](https://semver.org/):

```bash
# Major release (breaking changes)
git tag -a v2.0.0 -m "Release version 2.0.0"

# Minor release (new features)
git tag -a v1.1.0 -m "Release version 1.1.0"

# Patch release (bug fixes)
git tag -a v1.0.1 -m "Release version 1.0.1"

# Push tags
git push origin --tags
```

## 🔍 Code Review Checklist

Before merging any PR:

- [ ] Code follows TypeScript/Solidity style guide
- [ ] All tests pass
- [ ] No hardcoded secrets or keys
- [ ] Database migrations included (if needed)
- [ ] Documentation updated
- [ ] No console.logs in production code
- [ ] Error handling implemented
- [ ] Performance impact considered
- [ ] Security implications reviewed

## 🚀 Release Process

### 1. Prepare Release
```bash
# Create release branch
git checkout -b release/1.2.0 develop

# Update version in package.json files
pnpm version 1.2.0

# Update CHANGELOG.md
# Run final tests
pnpm test

git commit -m "chore: prepare release 1.2.0"
```

### 2. Deploy to Testnet
```bash
# Deploy contracts
pnpm deploy:contracts

# Deploy services
docker-compose up -d
```

### 3. Merge to Main
```bash
# After testing
git checkout main
git merge --no-ff release/1.2.0
git tag -a v1.2.0 -m "Release version 1.2.0"
git push origin main --tags

# Back-merge to develop
git checkout develop
git merge --no-ff release/1.2.0
git push origin develop
```

## 🔒 Security Guidelines

### Never Commit:
- Private keys
- API secrets
- Database passwords
- Wallet mnemonics
- .env files (except .env.example)

### Always:
- Use environment variables for secrets
- Review diff before committing
- Run security checks in pre-commit hooks

## 🛠️ Useful Git Commands

```bash
# Interactive rebase (squash commits)
git rebase -i HEAD~3

# Undo last commit (keep changes)
git reset --soft HEAD~1

# Stash changes
git stash
git stash pop

# Cherry-pick commit
git cherry-pick <commit-hash>

# View commit history
git log --oneline --graph --all

# Find who changed a line
git blame <file>

# Search commits
git log --grep="payment"

# Clean untracked files
git clean -fd
```

## 📊 Git Aliases

Add to `~/.gitconfig`:

```ini
[alias]
    co = checkout
    br = branch
    ci = commit
    st = status
    unstage = reset HEAD --
    last = log -1 HEAD
    visual = log --graph --pretty=format:'%Cred%h%Creset -%C(yellow)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset' --abbrev-commit --all
    contributors = shortlog --summary --numbered
```

## 🚨 Troubleshooting

### Accidentally committed secrets
```bash
# Remove from history (DANGEROUS - rewrites history)
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch PATH_TO_FILE" \
  --prune-empty --tag-name-filter cat -- --all

# Force push (coordinate with team)
git push origin --force --all
```

### Merge conflicts
```bash
# See conflicted files
git status

# Use theirs/ours
git checkout --theirs <file>
git checkout --ours <file>

# Abort merge
git merge --abort
```

## 📚 Resources

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
- [Git Flow](https://nvie.com/posts/a-successful-git-branching-model/)
- [GitHub Flow](https://guides.github.com/introduction/flow/)
- [Commitlint](https://commitlint.js.org/)