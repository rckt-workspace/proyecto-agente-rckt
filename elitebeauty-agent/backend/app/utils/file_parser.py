import io
import json
import xml.etree.ElementTree as ET
from pathlib import Path


SUPPORTED_EXTENSIONS = {'.pdf', '.docx', '.doc', '.txt', '.md', '.json', '.xml'}


def parse_file(filename: str, content: bytes) -> str:
    ext = Path(filename).suffix.lower()

    if ext == '.txt':
        return content.decode('utf-8', errors='ignore').strip()

    if ext == '.md':
        return content.decode('utf-8', errors='ignore').strip()

    if ext == '.json':
        try:
            data = json.loads(content.decode('utf-8', errors='ignore'))
            return _json_to_text(data).strip()
        except Exception:
            return content.decode('utf-8', errors='ignore').strip()

    if ext == '.xml':
        try:
            root = ET.fromstring(content)
            return _xml_to_text(root).strip()
        except Exception:
            return content.decode('utf-8', errors='ignore').strip()

    if ext == '.pdf':
        return _parse_pdf(content)

    if ext in ('.docx', '.doc'):
        return _parse_docx(content)

    return content.decode('utf-8', errors='ignore').strip()


def title_from_filename(filename: str) -> str:
    stem = Path(filename).stem
    return stem.replace('_', ' ').replace('-', ' ').title()


def _json_to_text(data, depth: int = 0) -> str:
    lines = []
    pad = '  ' * depth
    if isinstance(data, dict):
        for k, v in data.items():
            if isinstance(v, (dict, list)):
                lines.append(f"{pad}{k}:")
                lines.append(_json_to_text(v, depth + 1))
            else:
                lines.append(f"{pad}{k}: {v}")
    elif isinstance(data, list):
        for item in data:
            lines.append(_json_to_text(item, depth))
    else:
        lines.append(f"{pad}{data}")
    return '\n'.join(filter(None, lines))


def _xml_to_text(element) -> str:
    parts = []
    if element.text and element.text.strip():
        parts.append(element.text.strip())
    for child in element:
        child_text = _xml_to_text(child)
        if child_text:
            parts.append(child_text)
    if element.tail and element.tail.strip():
        parts.append(element.tail.strip())
    return ' '.join(parts)


def _parse_pdf(content: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError:
        raise ValueError("pypdf no está instalado en el servidor")
    try:
        reader = PdfReader(io.BytesIO(content))
        pages = []
        for page in reader.pages:
            text = page.extract_text()
            if text and text.strip():
                pages.append(text.strip())
        return '\n\n'.join(pages)
    except Exception as e:
        raise ValueError(f"No se pudo leer el PDF: {e}")


def _parse_docx(content: bytes) -> str:
    try:
        from docx import Document
    except ImportError:
        raise ValueError("python-docx no está instalado en el servidor")
    try:
        doc = Document(io.BytesIO(content))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        return '\n\n'.join(paragraphs)
    except Exception as e:
        raise ValueError(f"No se pudo leer el archivo Word: {e}")
