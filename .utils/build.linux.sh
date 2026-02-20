#!/bin/bash
set -e  # 任何命令失败即退出脚本

# 检查 npx 是否可用
if ! command -v npx &> /dev/null; then
    echo "错误：未找到 npx，请确保已安装 npm 且 npx 在 PATH 中。" >&2
    exit 1
fi

# 定义恢复函数：将 main 字段改为 ./src/entry.js
revert_main() {
    rm -rf dist
    sed -i 's#"main": *"[^"]*"#"main": "./src/entry.js"#' package.json
    echo "已恢复 main 字段为 ./src/entry.js"
}

# 设置 trap，保证脚本退出时执行恢复
trap revert_main EXIT

# 修改 main 字段为 dist/extension.js
sed -i 's#"main": *"[^"]*"#"main": "dist/extension.js"#' package.json
echo "已临时修改 main 字段为 dist/extension.js"

# 执行打包命令
npx vsce package --allow-star-activation