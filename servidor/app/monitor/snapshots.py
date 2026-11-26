"""Fotos (snapshots) dos canais, gravadas pelo próprio teste de vídeo.

Cada canal tem no máximo um arquivo `<id>.jpg` em SNAPSHOT_DIR. O FFmpeg grava primeiro em `<id>.tmp.jpg`;
só depois de uma captura bem-sucedida o arquivo substitui a foto anterior (nunca fica meia imagem).
A data da foto é a data de modificação do arquivo.
"""
from __future__ import annotations

import datetime as dt
import os

from ..config import get_config


def directory() -> str:
    d = get_config().snapshot_dir
    os.makedirs(d, exist_ok=True)
    return d


def path_for(channel_id: int) -> str:
    return os.path.join(get_config().snapshot_dir, f"{int(channel_id)}.jpg")


def tmp_path_for(channel_id: int) -> str:
    return os.path.join(directory(), f"{int(channel_id)}.tmp.jpg")


def commit(channel_id: int) -> bool:
    """Promove a captura temporária para foto atual. Devolve True se havia imagem nova."""
    tmp = tmp_path_for(channel_id)
    try:
        if os.path.getsize(tmp) > 0:
            os.replace(tmp, path_for(channel_id))
            return True
        os.remove(tmp)
    except FileNotFoundError:
        pass
    return False


def taken_at(channel_id: int) -> str | None:
    try:
        ts = os.path.getmtime(path_for(channel_id))
    except OSError:
        return None
    return dt.datetime.fromtimestamp(ts, dt.timezone.utc).isoformat()


def delete(channel_id: int) -> None:
    for p in (path_for(channel_id), os.path.join(get_config().snapshot_dir, f"{int(channel_id)}.tmp.jpg")):
        try:
            os.remove(p)
        except OSError:
            pass
