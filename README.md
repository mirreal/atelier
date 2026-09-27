# atelier

静态站点。`site/` 下每篇作品一个目录，目录里的 `index.html` 就是那篇作品。

```
site/
  index.html         ← 由脚本生成，不要手改
  favicon.svg        ← logo 源文件
  apple-touch-icon.png
  about.html         ← 也可以是独立页面，不必每个都建目录
  tractatus/
    index.html
```

## 索引页

`site/index.html` 由 `scripts/build-index.mjs` 生成，运行：

```sh
npm run index
```

脚本遍历 `site/`，两类东西各算一个条目：

| | 例子 | 链接指向 |
|---|---|---|
| 目录 | `site/tractatus/index.html` | `tractatus/` |
| 独立 HTML 文件 | `site/seedance-2-5-….html` | `seedance-2-5-….html` |

- 目录的 `index.html` 就是这个目录的条目，不会再单独收一次
- 目录可以没有 `index.html`，这时它自己不算条目，但里面的文件仍会收在同名分组下
- `site/index.html` 是索引页自己，永远不进列表
- 标题取 `<title>`，其次 `og:title`，再次首个 `<h1>`，最后用路径兜底（`about-me.html` → `about me`）；`逻辑哲学论 · 一架梯子` 这种写法会拆成标题 + 副标
- 摘要取 `<meta name="description">`（或 `og:description`），没有就只显示标题
- 名字以数字开头可以控制顺序（`02-paint` 排在 `10-…` 前面）
- 跳过 `.` 开头的文件与目录、`node_modules` / `dist` / `build` / `out` / `coverage` / `vendor` 目录，以及 `404.html` / `500.html`
- 存在二级目录时按首层目录分组，顶层的条目平铺在最前面
- 内容没有变化就不写盘，不会污染 `git diff`

想让某个页面在索引里带一段摘要，在它的 HTML 里加一行即可：

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
