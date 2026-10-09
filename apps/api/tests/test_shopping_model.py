import pytest
from sqlalchemy import delete, select, text
from sqlalchemy.exc import IntegrityError

from app.models import ShoppingItem, User

pytestmark = pytest.mark.integration


def test_new_items_are_unchecked_by_default_in_the_database(session_factory, owner):
    with session_factory() as session:
        # Plain SQL, so the database default applies rather than the model's.
        session.execute(
            text(
                "INSERT INTO shopping_items (id, owner_id, name)"
                " VALUES (gen_random_uuid(), :o, 'Milk')"
            ),
            {"o": owner.id},
        )
        session.commit()
        item = session.scalar(select(ShoppingItem))

    assert item.checked is False
    assert item.quantity is None
    assert item.notes is None
    assert item.created_at is not None
    assert item.updated_at is not None


def test_items_need_an_owner(session_factory):
    with session_factory() as session:
        session.add(ShoppingItem(name="Orphan"))
        with pytest.raises(IntegrityError):
            session.commit()


def test_deleting_the_owner_deletes_their_items(session_factory, owner):
    with session_factory() as session:
        session.add(ShoppingItem(owner_id=owner.id, name="Milk"))
        session.commit()

        session.execute(delete(User).where(User.id == owner.id))
        session.commit()

        assert session.scalar(select(ShoppingItem)) is None
