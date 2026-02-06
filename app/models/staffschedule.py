from typing import Optional, TYPE_CHECKING
from sqlmodel import SQLModel, Field

if TYPE_CHECKING:
    from .user import User


class staffSchedule(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    staff_id: int = Field(foreign_key="user.id")
    day_of_week: int  # 0 para Lunes, 6 para Domingo
    start_time: str   # "09:00"
    end_time: str     # "18:00"
    is_active: bool = True
