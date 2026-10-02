from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionDep
from app.main import create_app
from app.models import Base


def test_session_dependency_gives_each_request_its_own_session_bound_to_the_app_engine(
    settings,
):
    app = create_app(settings)
    seen: list[Session] = []

    @app.get("/_session")
    def use_session(session: SessionDep) -> dict[str, bool]:
        seen.append(session)
        return {"bound": session.get_bind() is app.state.engine}

    with TestClient(app) as client:
        assert client.get("/_session").json() == {"bound": True}
        assert client.get("/_session").json() == {"bound": True}

    assert len(seen) == 2
    assert seen[0] is not seen[1]


def test_session_dependency_closes_the_session_after_the_request(settings, monkeypatch):
    app = create_app(settings)
    closed: list[bool] = []
    original_close = Session.close

    def tracking_close(self: Session) -> None:
        closed.append(True)
        original_close(self)

    monkeypatch.setattr(Session, "close", tracking_close)

    @app.get("/_session")
    def use_session(session: SessionDep) -> dict[str, str]:
        return {"status": "ok"}

    with TestClient(app) as client:
        client.get("/_session")

    assert closed == [True]


def test_creating_the_app_does_not_connect_to_the_database(settings):
    # settings point at an unreachable port; building the app and its session factory
    # must still succeed, because nothing connects until a query runs.
    app = create_app(settings)
    assert app.state.session_factory is not None


def test_base_metadata_names_constraints_deterministically():
    convention = Base.metadata.naming_convention
    assert convention["pk"] == "pk_%(table_name)s"
    assert {"ix", "uq", "ck", "fk", "pk"} <= set(convention)
