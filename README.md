# Yande.re Direct Downloader

一个 Tampermonkey 油猴脚本，用于在 [yande.re](https://yande.re) 图片详情页一键保存原图到自定义本地文件夹。

## 功能

- 在 yande.re 任意页面通过右下角齿轮按钮打开设置面板，添加任意数量的保存路径
- 每条路径可自定义名称，并通过系统文件夹选择器绑定本地文件夹
- 进入图片详情页（`/post/show/{id}`）后，侧栏出现对应的保存按钮，点击即可将原图直接写入绑定文件夹
- 数据持久化存储，刷新页面或重启浏览器后配置不丢失

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 点击 Tampermonkey 图标 → 仪表盘 → 实用工具 → 从 URL 安装，粘贴脚本 raw URL；或直接新建脚本，将 `yande-downloader.user.js` 内容复制进去
3. 需要 **Chrome 86+** 或 **Edge 86+**（依赖 File System Access API，Firefox 暂不支持）

## 使用

1. 访问 https://yande.re/post ，点击右下角齿轮按钮
2. 点击 **"+ Add Path"** 添加路径
   - **Name**：自定义名称，如 `壁纸`、`收藏`
   - **Choose Folder**：选择本地文件夹
3. 打开任意图片详情页，侧栏 **"Save To"** 区域会出现对应按钮
4. 点击按钮，首次会弹出浏览器授权确认，之后同标签页内无需再次确认

## 注意

- 首次写入文件夹时，Chrome 会弹出 "Allow yande.re to see files in [folder]" 授权确认，这是浏览器安全机制，同标签页内只需确认一次
- 文件命名与 yande.re 原始文件名一致
