# 发布到 GitHub Pages

这个项目是**纯静态网页**（HTML + ES Modules + Three.js + MP3），不需要后端，可以直接部署到 GitHub Pages。

## 一、先确认要上传什么

运行时真正需要的文件：

```text
index.html
styles.css
game.js
js/
data/
vendor/
audio/          # 约 42MB，3,287 个 mp3
manifest.webmanifest
sw.js
icons/
.nojekyll       # 必须，告诉 GitHub Pages 不要用 Jekyll 处理
```

`sources/`、`scripts/`、`docs/`、`README.md`、`ATTRIBUTION.md`、`LICENSE` 不参与游戏运行，但建议一起上传，方便别人复现和查看版权说明。整体约 51MB，远低于 GitHub Pages 的 1GB 站点上限。

## 二、创建仓库并推送

在项目目录执行（把 `<你的用户名>`、`<仓库名>` 换成实际值）：

```bash
cd /Users/backyes/Documents/deepseek-harness/default-workspace/pet-vocab-starship

git init
git add .
git commit -m "PET 词汇星舰：3D 网页词汇游戏"
git branch -M main

# 先在 GitHub 网页上新建一个空仓库，不要勾选 README
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

> `audio/` 有 3,000 多个小文件，首次 `git add` / `push` 会慢一些，属正常现象。不要用 Git LFS；Pages 不直接托管 LFS 里的音频。

## 三、开启 Pages

1. 打开 GitHub 仓库 → **Settings** → **Pages**
2. **Build and deployment** → **Source** 选 `Deploy from a branch`
3. **Branch** 选 `main`，目录选 `/ (root)`
4. 点 **Save**
5. 等 1–3 分钟

访问地址（以本仓库 `backyes/pet-vocab-starship` 为例）：

- 星舰主站：<https://backyes.github.io/pet-vocab-starship/>
- 词花令卡牌小游戏：<https://backyes.github.io/pet-vocab-starship/ink-cards/>

仓库名不是 `<用户名>.github.io` 时是 `https://<用户名>.github.io/<仓库名>/`；正好是 `<用户名>.github.io` 时是 `https://<用户名>.github.io/`。

`ink-cards/` 是仓库里的子目录，同样由这一次 Pages 构建发布，**不需要单独建仓库或再开一次 Pages**。之后每次 `git push origin main`，1–3 分钟内自动重新构建。

## 四、发布后检查

- 首页能进入，点「启动星舰」后能开始游戏
- 点作战终端底部的「词花令 · 水墨拍卡」，能进入 `/ink-cards/` 并开始拍卡
- 进入听写舱，能听到发音；卡牌局里拍中词笺能听到单词英音
- 手机 Safari/Chrome 打开同一 URL，能触屏选目标
- iPhone「添加到主屏幕」/ Android「安装应用」可用（Pages 是 HTTPS，PWA 和 Service Worker 正常）
- 如果修改了 `sw.js` 的缓存版本，记得把 `VERSION` 加一，避免旧缓存

## 五、常见问题

### 页面 404 / 样式或词库加载失败
确认 Pages 发布目录是仓库根目录，且根目录有 `index.html` 和 `.nojekyll`。

### 音频 404
`audio/` 必须完整上传；`data/vocab.json` 里的 `audio` 字段是相对路径，仓库目录结构不能改。

### 推送很慢或失败
- 音频文件多，第一次推送慢是正常的
- 如果 GitHub 提示大文件，确认单个 mp3 没超过 100MB（当前每个约 10–20KB）
- 使用 HTTPS 推送时，密码要换成 GitHub Personal Access Token

### 想发布到自定义域名
在 Pages 设置里填 Custom domain，并在仓库根目录加 `CNAME` 文件；DNS 按 GitHub 文档配置。

## 六、版权提醒

代码是 MIT；词表、中文释义、例句、音频来自 Cambridge 官方词表与 Turtle Bay PET/KET Flashcards（CC BY-NC 4.0），**仅限非商业学习使用**。如果公开仓库/站点，请保留 `ATTRIBUTION.md`，不要用于付费课程或商业产品。
