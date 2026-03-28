"""Read-only tests for IdentityRegistry operations."""



class TestGetAgentOwner:
    def test_get_agent_owner_933(self, client):
        """Agent 933 should have an owner address."""
        owner = client.get_agent_owner(933)
        assert isinstance(owner, str)
        assert owner.startswith("0x")
        assert len(owner) == 42

    def test_get_agent_owner_934(self, client):
        """Agent 934 should have an owner address."""
        owner = client.get_agent_owner(934)
        assert isinstance(owner, str)
        assert owner.startswith("0x")
        assert len(owner) == 42


class TestGetAgentUri:
    def test_get_agent_uri_933(self, client):
        """Agent 933 should have a metadata URI."""
        uri = client.get_agent_uri(933)
        assert isinstance(uri, str)

    def test_get_agent_uri_934(self, client):
        """Agent 934 should have a metadata URI."""
        uri = client.get_agent_uri(934)
        assert isinstance(uri, str)
