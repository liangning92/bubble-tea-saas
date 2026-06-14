# GitHub Actions CI/CD

## 文件说明

- `build-windows.yml` - Windows 构建工作流（生成安装包）
- `ci.yml` - 通用 CI（测试 + 构建）

## 设置步骤

### 1. 创建 GitHub 仓库（如果没有）
在 GitHub 上创建新仓库，然后：

```bash
cd ~/Desktop/Claude_Work/bubble-tea-saas
git init
git add .
git commit -m "Initial commit with GitHub Actions"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/bubble-tea-saas.git
git push -u origin main
```

### 2. 启用 GitHub Actions
1. 打开 GitHub 仓库页面
2. 点击 Actions 标签
3. 应该能看到两个 workflow，选择 `CI - Test on push`
4. 点击 Enable

### 3. 触发构建
- 每次 push 到 main 分支会自动构建
- 或者手动点击 workflow_dispatch 触发

### 4. 下载构建产物
1. 打开 Actions 标签
2. 选择某个 workflow run
3. 点击 Artifacts 下载

## 工作流说明

| Workflow | 运行平台 | 触发条件 |
|----------|----------|----------|
| ci.yml | ubuntu + windows | push/PR |
| build-windows.yml | windows | push to main |

## 注意

- 需要先推送到 GitHub 才能使用 GitHub Actions
- Windows Runner 是 GitHub 提供的免费虚拟环境
