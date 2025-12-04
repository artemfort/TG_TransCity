from __future__ import annotations

from typing import Any, Dict, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from database import Database, Player
from bot import business_income, get_tax_balance, now_ts, active_event_ids, EVENTS
from game_data import BUSINESSES, ESTATES, BUSINESS_COOLDOWN, ESTATE_RENT_COOLDOWN

db = Database("game.db")

app = FastAPI(title="TransCity HUD API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup() -> None:
    await db.init()


def business_snapshot(player: Player) -> List[Dict[str, Any]]:
    now = now_ts()
    entries: List[Dict[str, Any]] = []
    for biz_id, state in (player.businesses or {}).items():
        info = BUSINESSES.get(biz_id, {})
        level = int(state.get("level", 0))
        income = business_income(biz_id, level)
        last_collect = float(state.get("last_collect", 0))
        ready_in = 0
        if last_collect:
            ready_in = max(0, int(BUSINESS_COOLDOWN - (now - last_collect)))
        entries.append(
            {
                "id": biz_id,
                "name": info.get("name", biz_id),
                "category": info.get("category"),
                "income": income,
                "level": level,
                "ready_in": ready_in,
                "tag": state.get("tag"),
            }
        )
    entries.sort(key=lambda item: item["name"])
    return entries


def estate_snapshot(player: Player) -> List[Dict[str, Any]]:
    now = now_ts()
    entries: List[Dict[str, Any]] = []
    for estate_id, state in (player.estates or {}).items():
        info = ESTATES.get(estate_id, {})
        last_rent = float(state.get("last_rent", 0))
        ready_in = 0
        if last_rent:
            ready_in = max(0, int(ESTATE_RENT_COOLDOWN - (now - last_rent)))
        entries.append(
            {
                "id": estate_id,
                "name": info.get("name", estate_id),
                "rent": info.get("rent_income", 0),
                "ready_in": ready_in,
                "note": info.get("description", ""),
            }
        )
    entries.sort(key=lambda item: item["name"])
    return entries


def build_timeline(player: Player, city_state: Dict[str, Any], tax_balance: float) -> List[Dict[str, str]]:
    modifier = city_state.get("tax_modifier", 1.0)
    auction = city_state.get("auction") or {}
    lot_name = BUSINESSES.get(auction.get("item_id"), {}).get("name", "секретный лот")
    items = [
        {
            "title": "Налоговая активность",
            "text": f"Модификатор города x{modifier:.2f}. К погашению {int(tax_balance)}$, иначе включатся штрафы и блокировка бизнеса.",
        },
        {
            "title": "Аукцион",
            "text": ("Аукцион идёт: разыгрывается " + lot_name)
            if auction.get("active")
            else "Аукцион готовится к новому лоту. Мэр формирует праздничный пул призов.",
        },
        {
            "title": "Городские эффекты",
            "text": "Активные события влияют на доходы, налоги и банк. Перед сбором прибыли проверьте меню мэра.",
        },
    ]
    if player.debt > 0:
        items.append(
            {
                "title": "Состояние долга",
                "text": "Обнаружена просрочка. Бот заберёт вклад, наличные и активы, если таймер истечёт.",
            }
        )
    return items


def build_events(city_state: Dict[str, Any]) -> List[Dict[str, str]]:
    ids = active_event_ids(city_state)
    events: List[Dict[str, str]] = []
    for eid in ids:
        info = EVENTS.get(eid)
        if not info:
            continue
        events.append(
            {
                "title": info.get("name", "Событие"),
                "note": info.get("description", ""),
                "timer": "",
            }
        )
    return events


def player_mood_text(player: Player, tax_balance: float) -> Dict[str, str]:
    if player.debt > 0:
        return {
            "mood": "Налоговая присматривается.",
            "motto": "Закройте долг, иначе бот заберёт вклад и активы.",
        }
    if tax_balance > 0:
        return {
            "mood": "Таймер налога уже тикает.",
            "motto": "Оплатите счёт, чтобы бизнесы не блокировались.",
        }
    if player.bank_balance > player.money:
        return {
            "mood": "Вклад растёт быстрее кошелька.",
            "motto": "Порадуйте себя апгрейдом, пока ставка +5%.",
        }
    return {
        "mood": "Баланс под контролем, можно отдыхать.",
        "motto": "Соберите прибыль и готовьтесь к праздникам.",
    }


async def build_state(user_id: int) -> Dict[str, Any]:
    player = await db.get_player(user_id)
    if not player:
        raise HTTPException(status_code=404, detail="Профиль не найден в базе.")
    city_state = await db.get_city_state()
    tax_balance = get_tax_balance(player)
    auction = city_state.get("auction") or {}

    status = {
        "tax_balance": tax_balance,
        "tax_note": city_state.get("event_note") or "Погашайте налог каждые 30 минут после начисления.",
        "bank_note": "Вклад приносит +5% каждые сутки активной игры.",
        "debt_note": (
            "Обнаружена просрочка: вклад и активы могут быть заморожены."
            if player.debt > 0
            else "Просроченных кредитов нет."
        ),
        "city_mood": "Город готовится к праздникам" if city_state.get("events") else "Город спокоен",
        "city_note": "Аукцион идёт прямо сейчас." if auction.get("active") else "Аукцион готовится к новому лоту.",
    }

    mood = player_mood_text(player, tax_balance)

    state = {
        "player": {
            "name": player.username or f"Игрок {player.user_id}",
            "job": player.job,
            "level": player.level,
            "wallet": player.money,
            "bank": player.bank_balance,
            "debt": player.debt,
            "mood": mood["mood"],
            "motto": mood["motto"],
        },
        "status": status,
        "businesses": business_snapshot(player),
        "estates": estate_snapshot(player),
        "events": build_events(city_state),
        "timeline": build_timeline(player, city_state, tax_balance),
    }
    return state


@app.get("/api/state/{user_id}")
async def get_state(user_id: int) -> Dict[str, Any]:
    return await build_state(user_id)
