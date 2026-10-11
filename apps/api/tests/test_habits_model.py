from datetime import date

import pytest
from sqlalchemy import delete, func, select, text
from sqlalchemy.exc import IntegrityError

from app.models import Habit, HabitCheckIn, User
from tests.conftest import OTHER_EMAIL

pytestmark = pytest.mark.integration

DAY = date(2026, 10, 11)


def add_habit(session, owner_id) -> Habit:
    habit = Habit(owner_id=owner_id, name="Read")
    session.add(habit)
    session.commit()
    return habit


def test_new_habits_are_active_in_the_database(session_factory, owner):
    with session_factory() as session:
        # Plain SQL, so the database defaults apply rather than the model's.
        session.execute(
            text("INSERT INTO habits (id, owner_id, name) VALUES (gen_random_uuid(), :o, 'Read')"),
            {"o": owner.id},
        )
        session.commit()
        habit = session.scalar(select(Habit))

    assert habit.archived_at is None
    assert habit.notes is None
    assert habit.created_at is not None
    assert habit.updated_at is not None


def test_a_habit_has_at_most_one_check_in_per_day(session_factory, owner):
    with session_factory() as session:
        habit = add_habit(session, owner.id)
        session.add(HabitCheckIn(owner_id=owner.id, habit_id=habit.id, day=DAY))
        session.commit()

        session.add(HabitCheckIn(owner_id=owner.id, habit_id=habit.id, day=DAY))
        with pytest.raises(IntegrityError, match="uq_habit_check_ins_habit_id_day"):
            session.commit()


def test_a_check_in_must_belong_to_its_habits_owner(session_factory, owner):
    with session_factory() as session:
        habit = add_habit(session, owner.id)
        # A second user, inside this transaction only (one owner per instance otherwise).
        session.execute(text("ALTER TABLE users DROP CONSTRAINT uq_users_is_owner"))
        other = User(email=OTHER_EMAIL, display_name="Other", password_hash="x")
        session.add(other)
        session.flush()

        session.add(HabitCheckIn(owner_id=other.id, habit_id=habit.id, day=DAY))
        with pytest.raises(IntegrityError, match="fk_habit_check_ins_habit_id_owner_id_habits"):
            session.flush()
        session.rollback()


def test_deleting_a_habit_deletes_its_check_ins(session_factory, owner):
    with session_factory() as session:
        habit = add_habit(session, owner.id)
        session.add(HabitCheckIn(owner_id=owner.id, habit_id=habit.id, day=DAY))
        session.commit()

        session.execute(delete(Habit).where(Habit.id == habit.id))
        session.commit()

        assert session.scalar(select(func.count()).select_from(HabitCheckIn)) == 0


def test_deleting_the_owner_deletes_their_habits_and_check_ins(session_factory, owner):
    with session_factory() as session:
        habit = add_habit(session, owner.id)
        session.add(HabitCheckIn(owner_id=owner.id, habit_id=habit.id, day=DAY))
        session.commit()

        session.execute(delete(User).where(User.id == owner.id))
        session.commit()

        assert session.scalar(select(Habit)) is None
        assert session.scalar(select(HabitCheckIn)) is None
