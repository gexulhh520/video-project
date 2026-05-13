import json
import re
import sys
from pathlib import Path
from zipfile import ZipFile

from docx import Document

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def sanitize_name(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", value)
    return cleaned.strip("._") or "image"


def build_relationship_map(docx_path: Path):
    mapping = {}
    with ZipFile(docx_path, "r") as archive:
        rels_xml = archive.read("word/_rels/document.xml.rels")
        media_names = [name for name in archive.namelist() if name.startswith("word/media/")]
        media_bytes = {name.replace("word/", ""): archive.read(name) for name in media_names}

    from xml.etree import ElementTree as ET

    root = ET.fromstring(rels_xml)
    ns = {"r": "http://schemas.openxmlformats.org/package/2006/relationships"}
    for rel in root.findall("r:Relationship", ns):
        rel_id = rel.attrib.get("Id")
        target = rel.attrib.get("Target", "")
        if rel_id and target.startswith("media/"):
            mapping[rel_id] = media_bytes.get(target)
    return mapping


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: import_word_docx.py <source_docx_path> <output_image_dir>", file=sys.stderr)
        return 1

    source_path = Path(sys.argv[1])
    output_image_dir = Path(sys.argv[2])
    output_image_dir.mkdir(parents=True, exist_ok=True)

    doc = Document(str(source_path))
    rel_map = build_relationship_map(source_path)

    title = ""
    paragraphs = []
    section_images = []

    image_counter = 0
    for para in doc.paragraphs:
        paragraph_text = para.text.strip()
        if not title and paragraph_text:
            title = paragraph_text

        image_paths = []
        embed_ids = para._p.xpath('.//a:blip/@r:embed')
        for rel_id in embed_ids:
            content = rel_map.get(rel_id)
            if not content:
                continue
            image_counter += 1
            filename = f"img_{image_counter:03d}.png"
            target_path = output_image_dir / sanitize_name(filename)
            target_path.write_bytes(content)
            image_paths.append(str(target_path))

        if paragraph_text:
            paragraphs.append(paragraph_text)
            section_images.append(image_paths)
        elif image_paths:
            if not paragraphs:
                paragraphs.append(f"配图段落 {len(paragraphs) + 1}")
                section_images.append(image_paths)
            else:
                section_images[-1].extend(image_paths)

    if not paragraphs:
        paragraphs = ["导入文档未检测到可用正文，请补充内容后再洗稿。"]
        section_images = [[]]

    payload = {
        "title": title or source_path.stem,
        "paragraphs": paragraphs,
        "sectionImages": section_images,
    }
    print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
