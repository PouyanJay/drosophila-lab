"""Check discoverability and shared sources without invoking a coding client."""

from pathlib import Path
import subprocess
import tomllib
import yaml

ROOT = Path(__file__).resolve().parents[1]


def main():
    assert (ROOT / "AGENTS.md").resolve() == (ROOT / "CLAUDE.md").resolve()
    source = ROOT / ".claude/skills"
    assert (ROOT / ".agents/skills").resolve() == source.resolve()
    skills = list(source.glob("*/SKILL.md"))
    agents = list((ROOT / ".claude/agents").glob("*.md"))
    assert skills and agents
    for skill in skills:
        metadata = yaml.safe_load(skill.read_text().split("---", 2)[1])
        assert metadata["name"] == skill.parent.name, skill
        assert metadata["description"], skill
        assert (
            ROOT / ".agents/skills" / skill.parent.name / "SKILL.md"
        ).read_bytes() == skill.read_bytes()
    for agent in agents:
        metadata = yaml.safe_load(agent.read_text().split("---", 2)[1])
        assert metadata["name"] == agent.stem
        adapter = ROOT / ".codex/agents" / (agent.stem + ".toml")
        config = tomllib.loads(adapter.read_text())
        assert config["name"] == agent.stem
        assert str(agent.relative_to(ROOT)) in config["developer_instructions"]
        assert "model" not in config, "Codex reviewers should inherit the session model"
    assert {p.stem for p in (ROOT / ".codex/agents").glob("*.toml")} == {p.stem for p in agents}
    paths = ["CLAUDE.md", "AGENTS.md", ".agents/skills"]
    paths += [
        str(p.relative_to(ROOT))
        for folder in (".claude", ".codex")
        for p in (ROOT / folder).rglob("*")
        if p.is_file()
    ]
    result = subprocess.run(
        ["git", "check-ignore", "--no-index", "--stdin"],
        input="\n".join(paths),
        text=True,
        capture_output=True,
        cwd=ROOT,
    )
    assert result.returncode == 1, (
        "Instruction files must not be ignored: " + result.stdout + result.stderr
    )
    print(
        f"PASS: {len(skills)} shared skills, {len(agents)} paired reviewers, instruction aliases, and Git visibility"
    )


if __name__ == "__main__":
    main()
