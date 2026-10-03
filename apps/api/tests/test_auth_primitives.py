import hashlib

import pytest
from argon2 import PasswordHasher

from app.auth.passwords import (
    MIN_PASSWORD_LENGTH,
    hash_password,
    needs_rehash,
    validate_new_password,
    verify_password,
)
from app.auth.service import normalize_email
from app.auth.tokens import generate_token, hash_token


def test_password_hash_is_argon2id_and_does_not_contain_the_password():
    password_hash = hash_password("correct horse battery staple")

    assert password_hash.startswith("$argon2id$")
    assert "correct horse" not in password_hash


def test_password_hashes_are_salted():
    assert hash_password("same password!!") != hash_password("same password!!")


def test_verify_password_accepts_the_right_password_only():
    password_hash = hash_password("correct horse battery staple")

    assert verify_password(password_hash, "correct horse battery staple")
    assert not verify_password(password_hash, "wrong password")


def test_verify_password_fails_without_a_hash_or_with_garbage():
    assert not verify_password(None, "anything")
    assert not verify_password("not-a-hash", "anything")


def test_hashes_made_with_weaker_parameters_need_rehashing():
    weak = PasswordHasher(time_cost=1, memory_cost=8, parallelism=1).hash("pw")

    assert needs_rehash(weak)
    assert not needs_rehash(hash_password("pw"))


@pytest.mark.parametrize("password", ["", "short", "x" * (MIN_PASSWORD_LENGTH - 1), "x" * 1025])
def test_new_passwords_must_have_a_sensible_length(password):
    with pytest.raises(ValueError):
        validate_new_password(password)


def test_tokens_are_long_random_and_url_safe():
    tokens = {generate_token() for _ in range(100)}

    assert len(tokens) == 100
    assert all(len(token) >= 43 for token in tokens)  # 32 bytes, base64url
    assert all(
        set(token) <= set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")
        for token in tokens
    )


def test_token_hash_is_sha256_hex_and_not_the_token():
    token = generate_token()

    assert hash_token(token) == hashlib.sha256(token.encode()).hexdigest()
    assert hash_token(token) != token


@pytest.mark.parametrize("email", ["Owner@Example.COM", "  owner@example.com "])
def test_emails_are_normalized(email):
    assert normalize_email(email) == "owner@example.com"


@pytest.mark.parametrize("email", ["", "not-an-email", "a@", "@b.com"])
def test_invalid_emails_are_rejected(email):
    with pytest.raises(ValueError):
        normalize_email(email)
