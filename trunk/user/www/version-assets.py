#!/usr/bin/env python3
"""打包时按实际内容标记脚本和样式版本，避免升级后混用浏览器旧缓存。"""
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
import hashlib
import re
import sys

TAG = re.compile(r'<(?:script|link)\b[^>]*>', re.I)
REF = re.compile(r'\b(src|href)\s*=\s*([\"\'])(.*?)\2', re.I)


def version_page(text, page, root):
    def tag(match):
        def reference(attr):
            url = urlsplit(attr[3])
            if url.scheme or url.netloc or not url.path.endswith(('.js', '.css')):
                return attr[0]
            target = ((root / url.path.lstrip('/')) if url.path.startswith('/') else page.parent / url.path).resolve()
            if root not in target.parents or not target.is_file():
                raise ValueError('页面引用不存在或越界: '+str(page)+' -> '+attr[3])
            digest = hashlib.sha256(target.read_bytes()).hexdigest()[:16]
            query = [(k, v) for k, v in parse_qsl(url.query) if k != 'v']
            query.append(('v', digest))
            value = urlunsplit(('', '', url.path, urlencode(query), url.fragment))
            return attr[1]+'='+attr[2]+value+attr[2]
        return REF.sub(reference, match[0])
    return TAG.sub(tag, text)


def stamp(root):
    root = Path(root).resolve(strict=True)
    count = 0
    for page in sorted(root.rglob('*')):
        if page.is_symlink() or page.suffix not in ('.asp', '.htm', '.html'):
            continue
        data = page.read_text(encoding='utf-8')
        updated = version_page(data, page, root)
        if updated != data:
            page.write_text(updated, encoding='utf-8', newline='\n')
            count += 1
    return count


if __name__ == '__main__':
    print('Web asset versions:', stamp(sys.argv[1]), 'pages updated')
