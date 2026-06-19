#!/usr/bin/env bash
set -e

# 检查 npx 是否可用
if ! command -v npx &> /dev/null; then
    echo "错误：未找到 npx，请确保已安装 npm 且 npx 在 PATH 中。" >&2
    exit 1
fi

PACKAGE_JSON="package.json"
ORIGINAL_MAIN='"./src/entry.js"'
BUNDLED_MAIN='"dist/extension.js"'

# 用 Node.js 读写 package.json，跨平台兼容
set_main() {
    node -e "
        const p = require('./${PACKAGE_JSON}');
        p.main = $1;
        require('fs').writeFileSync('./${PACKAGE_JSON}', JSON.stringify(p, null, 2) + '\n');
    "
}

revert_main() {
    rm -rf dist
    set_main "${ORIGINAL_MAIN}"
    echo "已恢复 main 字段为 ${ORIGINAL_MAIN}"
}

trap revert_main EXIT

set_main "${BUNDLED_MAIN}"
echo "已临时修改 main 字段为 ${BUNDLED_MAIN}"

npx vsce package --allow-star-activation