# atelier

静态站点。`site/` 下每篇作品一个目录，目录里的 `index.html` 就是那篇作品。

```
site/
  index.html      ← 由脚本生成，不要手改
```

## 索引页

`site/index.html` 由 `scripts/build-index.mjs` 生成，运行：

```sh
npm run index
```

脚本会遍历 `site/` 下的所有目录，把每个含有 `index.html` 的目录收进索引：

- 标题取 `<title>`，其次 `og:title`，再次首个 `<h1>`；`逻辑哲学论 · 一架梯子` 这种写法会拆成标题 + 副标
- 摘要取 `<meta name="description">`（或 `og:description`），没有就只显示标题
- 目录名以数字开头可以控制顺序（`02-paint` 排在 `10-…` 前面）
- 跳过 `.` 开头的目录和 `node_modules` / `dist` / `build` / `out` / `coverage` / `vendor`
- 存在二级目录时按首层目录分组
- 内容没有变化就不写盘，不会污染 `git diff`

想让某篇作品在索引里带一段摘要，在它的 `index.html` 里加一行即可：

```html
<meta name="description" content="关于逻辑的 一些 想法">
```

### 其他用法

```sh
npm run index:check                      # 只校验是否最新，过期则退出码 1（适合 CI / pre-commit）
node scripts/build-index.mjs --site dist --out dist/index.html
node scripts/build-index.mjs --title "作品集" --desc "一些练习"
node scripts/build-index.mjs --force     # 内容相同也重写
node scripts/build-index.mjs --help
```

零依赖，Node 18+ 即可（开发时用的是 Node 24）。
