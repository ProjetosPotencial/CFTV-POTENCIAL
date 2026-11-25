"""Teste de porta TCP com timeout e tentativas. Responder TCP NÃO significa que há vídeo."""
from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field


@dataclass
class TcpResult:
    attempts: int = 0
    successes: int = 0
    latency_ms: int | None = None
    errors: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.successes > 0

    @property
    def partial(self) -> bool:
        return 0 < self.successes < self.attempts


async def tcp_probe(host: str, port: int, timeout: float) -> tuple[bool, int | None, str]:
    t0 = time.perf_counter()
    try:
        _, writer = await asyncio.wait_for(asyncio.open_connection(host, port), timeout=timeout)
    except asyncio.TimeoutError:
        return False, None, f"timeout de {timeout:g} s"
    except ConnectionRefusedError:
        return False, None, "conexão recusada"
    except OSError as e:
        return False, None, (e.strerror or str(e))
    ms = int((time.perf_counter() - t0) * 1000)
    writer.close()
    try:
        await asyncio.wait_for(writer.wait_closed(), timeout=1)
    except Exception:
        pass
    return True, ms, ""


async def tcp_check(host: str, port: int, timeout: float, attempts: int, pause: float = 1.0,
                    stop_on_success: bool = False) -> TcpResult:
    """Faz `attempts` conexões. Com stop_on_success=False mede estabilidade (sucessos parciais => instável)."""
    res = TcpResult()
    lat: list[int] = []
    for i in range(attempts):
        ok, ms, err = await tcp_probe(host, port, timeout)
        res.attempts += 1
        if ok:
            res.successes += 1
            lat.append(ms or 0)
            if stop_on_success:
                break
        else:
            res.errors.append(err)
        if i < attempts - 1:
            await asyncio.sleep(pause)
    if lat:
        res.latency_ms = int(sorted(lat)[len(lat) // 2])
    return res
