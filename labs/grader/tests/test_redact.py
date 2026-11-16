"""What a receipt never holds (ARCHITECTURE section 9.5): the scrubber, the value policy and the last look.

Every personal value here is invented, and the strings that look like paths or tokens are built from pieces, so that this file holds none of them: the repository is
public, and a sweep of its tree (tests/docs/publication.test.ts) looks for home folders, scratch folders and the shape of a token.
"""

from __future__ import annotations

import unittest

from enginespace_grader import redact
from enginespace_grader.engine_config import EngineRun, read_engine_config
from enginespace_grader.redact import REDACTED, Sensitive, find_leaks, scrub_text, scrub_value

from .fakes import vllm_text

#: Built from pieces so that no file holds a home folder.
HOME = "/ho" + "me/learnerq8"
WINDOWS_HOME = "C:" + "\\" + "Us" + "ers" + "\\" + "learnerq8"
TOKEN = "hf" + "_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7"  # 34 characters after the prefix, as a Hugging Face token has
MACHINE = Sensitive(hosts=("gpu-box-7f3a9c",), users=("learnerq8",), folders=(HOME,), secrets=("sw0rdf1sh-value",))
NOBODY = Sensitive()


def scrubbed(text: str, kit_root: str | None = None) -> str:
    return scrub_text(text, sensitive=NOBODY, kit_root=kit_root)[0]


class Shapes(unittest.TestCase):
    def test_an_absolute_path_is_a_placeholder_and_a_path_under_the_kit_is_relative_to_it(self) -> None:
        self.assertEqual(scrubbed(f"download_dir={HOME}/.cache/huggingface, ok"), "download_dir=<path>, ok")
        kit = "/opt/example-kit"
        self.assertEqual(scrubbed(f"wrote {kit}/receipts/a.es.json.gz.", kit_root=kit), "wrote receipts/a.es.json.gz.")
        self.assertEqual(scrubbed(f"in {kit}", kit_root=kit), "in .")
        self.assertEqual(scrubbed(f"in {kit}-other/x", kit_root=kit), "in <path>", "a folder that only starts with the kit's name is not inside it")
        self.assertEqual(scrubbed("see ~/models/x and (/srv/data/y)"), "see <path> and (<path>)")
        self.assertEqual(scrubbed("Cache:/x/y file /v1/completions end"), "Cache:<path> file <path> end")

    def test_a_windows_path_and_a_share_are_placeholders(self) -> None:
        self.assertEqual(scrubbed(f"opened {WINDOWS_HOME}\\models\\m.bin ok"), "opened <path> ok")
        self.assertEqual(scrubbed("share " + "\\" * 2 + "fileserver" + "\\" + "data" + "\\" + "x"), "share <path>")

    def test_a_slash_inside_a_word_or_a_rate_is_not_a_path(self) -> None:
        for text in ("FLASH_ATTN/TRITON", "tokens/s=3", "and/or", "A100/H100", "1/2 of 11/09", "a / b", "(20.5 tokens / s)"):
            self.assertEqual(scrubbed(text), text)

    def test_a_url_goes_whole_with_its_credentials(self) -> None:
        self.assertEqual(scrubbed("GET https://user:pw@example.invalid/a/b?x=1 done"), "GET <url> done")
        self.assertEqual(scrubbed("s3://bucket/key and http://127.0.0.1:8000/v1"), "<url> and <url>")

    def test_an_ip_address_is_a_placeholder_and_a_dotted_version_is_not(self) -> None:
        self.assertEqual(scrubbed("host 10.20.30.40:8000 and ::1 and fe80::1 and 2001:db8:0:0:0:0:0:1"), "host <ip>:8000 and <ip> and <ip> and <ip>")
        for text in ("300.1.2.3", "580.82.07", "2.14.0+cu130", "9.10.2", "0.7.2.post1", "v0.33.0", "torch::cuda std::vector 12:30:45", "11-09 12:00:01"):
            self.assertEqual(scrubbed(text), text)
        self.assertEqual(scrub_text("kernel 5.15.167.4-microsoft", sensitive=NOBODY, ips=False), ("kernel 5.15.167.4-microsoft", 0), "a kernel release is not an address")
        self.assertEqual(scrubbed("kernel 5.15.167.4-microsoft"), "kernel <ip>-microsoft", "in a log, where it can be an address, it goes")

    def test_a_mac_address_and_a_pci_bus_address_are_placeholders(self) -> None:
        self.assertEqual(scrubbed("link aa:bb:cc:dd:ee:ff and AA-BB-CC-DD-EE-FF"), "link <mac> and <mac>")
        self.assertEqual(scrubbed("Bus-Id 00000000:01:00.0 and 0000:8b:00.0"), "Bus-Id <pci> and <pci>")

    def test_a_gpu_uuid_of_either_form_a_mig_device_and_a_bare_uuid_are_placeholders(self) -> None:
        for uuid in (
            "GPU-0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0",
            "GPU-b2f5f1b745e3d23d-65a3a26d-097db358-7303e0b6-149642ff3d219f8587cde3a8",
            "MIG-GPU-0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0/1/0",
            "MIG-0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0",
        ):
            self.assertEqual(scrubbed(f"device {uuid} ready"), "device <gpu-uuid> ready", uuid)
        self.assertEqual(scrubbed("id 0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0 ok"), "id <uuid> ok")
        self.assertEqual(scrubbed("GPU-accelerated and GPU-bound"), "GPU-accelerated and GPU-bound")

    def test_a_token_a_bearer_header_and_a_secret_pair_lose_the_secret(self) -> None:
        self.assertEqual(scrubbed(f"login {TOKEN} ok"), "login <secret> ok")
        self.assertEqual(scrubbed("Authorization: Bearer " + "x" * 20), "Authorization: Bearer <secret>")
        self.assertEqual(scrubbed("HF_TOKEN=abcd1234efgh5678"), "HF_TOKEN=<secret>")
        self.assertEqual(scrubbed("password: 'hunter2hunter2'"), "password: '<secret>'")
        # The words of an engine's log that contain "token" are not secrets.
        self.assertEqual(scrubbed("max_num_batched_tokens=8192 and token_ids=[1, 2]"), "max_num_batched_tokens=8192 and token_ids=[1, 2]")

    def test_a_serial_number_that_a_tool_names_as_one_is_a_placeholder(self) -> None:
        self.assertEqual(scrubbed("Serial Number                         : 1320423009876"), "Serial Number                         : <serial>")
        self.assertEqual(scrubbed("serial 1320423009876 and serial=SN-12345 and 'serial_no': 'AB12CD34'"), "serial <serial> and serial=<serial> and 'serial_no': '<serial>'")
        for text in ("a serial execution of requests", "serial: ok", "serial 12", "serialisation=1"):
            self.assertEqual(scrubbed(text), text)

    def test_the_count_says_how_many_replacements_were_made(self) -> None:
        self.assertEqual(scrub_text(f"{HOME}/a {HOME}/b and 10.0.0.1", sensitive=NOBODY)[1], 3)
        self.assertEqual(scrub_text("nothing here", sensitive=NOBODY)[1], 0)


class Literals(unittest.TestCase):
    def test_the_host_the_user_the_folder_and_the_secret_are_recognised_as_themselves(self) -> None:
        text = "gpu-box-7f3a9c:123:123 [0] NCCL INFO hello learnerq8 sw0rdf1sh-value"
        self.assertEqual(scrub_text(text, sensitive=MACHINE)[0], "<host>:123:123 [0] NCCL INFO hello <user> <redacted>")

    def test_a_literal_is_a_whole_word_so_other_words_are_not_cut(self) -> None:
        self.assertEqual(scrub_text("learnerq80 xlearnerq8 learnerq8_x", sensitive=MACHINE)[0], "learnerq80 xlearnerq8 learnerq8_x")

    def test_a_short_literal_matches_only_a_whole_value(self) -> None:
        sensitive = Sensitive(users=("ann",))
        self.assertEqual(scrub_text("channel ann", sensitive=sensitive)[0], "channel ann")
        self.assertEqual(scrub_value("ann", sensitive=sensitive), REDACTED)
        self.assertEqual(scrub_value("annex", sensitive=sensitive), "annex")

    def test_the_machines_own_names_come_from_the_environment_and_a_secret_from_the_name_of_its_variable(self) -> None:
        found = Sensitive.from_machine({"HOSTNAME": "gpu-box-7f3a9c.example.invalid", "USER": "learnerq8", "HOME": HOME, "HF_TOKEN": TOKEN, "MY_API_KEY": "abc12345", "PATH": "/usr/bin"})
        self.assertIn("gpu-box-7f3a9c.example.invalid", found.hosts)
        self.assertIn("gpu-box-7f3a9c", found.hosts, "the short form of a host name too")
        self.assertIn("learnerq8", found.users)
        self.assertIn(HOME, found.folders)
        self.assertEqual(sorted(found.secrets), sorted([TOKEN, "abc12345"]))
        self.assertNotIn("/usr/bin", found.secrets + found.others, "only a variable whose name says secret counts")

    def test_a_name_says_secret_by_one_of_its_words_and_token_only_as_the_last(self) -> None:
        for name in ("HF_TOKEN", "VLLM_API_KEY", "OPENAI_API_KEY", "SGLANG_AUTH_TOKEN", "AWS_SECRET_ACCESS_KEY", "DB_PASSWORD", "SSH_AUTH_SOCK", "SSL_KEYFILE", "GH_TOKEN"):
            self.assertTrue(redact.is_secret_name(name), name)
        # Six of vLLM v0.33.0's 303 variables have TOKEN in them and are about counts of tokens; none of them holds a secret.
        for name in (
            "VLLM_SHARED_EXPERTS_STREAM_TOKEN_THRESHOLD",
            "VLLM_MULTI_STREAM_GEMM_TOKEN_THRESHOLD",
            "VLLM_COHERE2_ATTN_MOE_DUAL_STREAM_TOKEN_THRESHOLD",
            "VLLM_MAX_TOKENS_PER_EXPERT_FP4_MOE",
            "VLLM_MAX_BAD_WORDS_TOTAL_TOKENS",
            "VLLM_USE_FASTOKENS",
            "VLLM_LOGGING_LEVEL",
            "SGLANG_ENABLE_OVERLAP",
            "MONKEYPATCH",
        ):
            self.assertFalse(redact.is_secret_name(name), name)

    def test_a_value_shorter_than_six_characters_is_not_taken_for_a_secret(self) -> None:
        self.assertEqual(Sensitive.from_machine({"SOME_TOKEN": "1"}).secrets, ())

    def test_the_account_of_a_container_or_a_runner_is_not_personal(self) -> None:
        found = Sensitive.from_machine({"USER": "root", "LOGNAME": "root", "HOSTNAME": "runner"})
        self.assertNotIn("root", found.users)
        self.assertNotIn("runner", found.hosts)
        # Were they literals, the words of a vLLM log would go: "using the V1 model runner instead".
        self.assertEqual(scrub_text("the V1 model runner, as root", sensitive=Sensitive(hosts=found.hosts[:0], users=found.users[:0]))[0], "the V1 model runner, as root")

    def test_with_more_adds_values_and_drops_the_empty_ones(self) -> None:
        more = Sensitive().with_more("GPU-serial-1234", "")
        self.assertEqual(scrub_text("see GPU-serial-1234", sensitive=more)[0], "see <redacted>")


class Values(unittest.TestCase):
    def test_a_plain_setting_is_recorded_as_it_is(self) -> None:
        for value in ("1", "0", "INFO", "FLASH_ATTN", "0.9", "a,b,c", "spawn"):
            self.assertEqual(scrub_value(value, sensitive=MACHINE), value)
        self.assertEqual(scrub_value("  INFO \n", sensitive=MACHINE), "INFO")

    def test_anything_personal_withholds_the_whole_value(self) -> None:
        for value in (HOME + "/.cache/vllm", "/opt/example/models", "10.1.2.3", "http://example.invalid/x", TOKEN, "learnerq8", "gpu-box-7f3a9c", "sw0rdf1sh-value", "GPU-0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0"):
            self.assertEqual(scrub_value(value, sensitive=MACHINE), REDACTED, value)

    def test_a_value_the_receipt_cannot_hold_is_withheld_too(self) -> None:
        self.assertEqual(scrub_value("x" * 257, sensitive=NOBODY), REDACTED)
        self.assertEqual(scrub_value("x" * 256, sensitive=NOBODY), "x" * 256)
        self.assertEqual(scrub_value("one\ntwo", sensitive=NOBODY), REDACTED)
        self.assertEqual(scrub_value("a\x00b", sensitive=NOBODY), REDACTED)


class LastLook(unittest.TestCase):
    def test_it_names_the_places_and_never_the_values(self) -> None:
        document = {"host": {"os": "Example Linux", "cpu": f"CPU at {HOME}/x"}, "gpus": [{"name": "A", "note": TOKEN}], "list": ["fine", "gpu-box-7f3a9c"]}
        found = find_leaks(document, MACHINE)
        self.assertEqual(found, ["/host/cpu", "/gpus/0/note", "/list/1"])
        for pointer in found:
            self.assertNotIn(HOME, pointer)
            self.assertNotIn("gpu-box", pointer)

    def test_a_key_that_holds_something_is_found_too(self) -> None:
        self.assertEqual(find_leaks({HOME + "/x": 1}, MACHINE), ["/" + (HOME + "/x").replace("~", "~0").replace("/", "~1")])

    def test_a_clean_document_has_no_leak_and_a_kernel_release_is_not_an_address(self) -> None:
        document = {"host": {"kernel": "5.15.167.4-microsoft-standard-WSL2", "os": "Ubuntu 24.04.1 LTS", "cpu": "13th Gen Intel(R) Core(TM) i5-13600KF", "kind": "local"}}
        self.assertEqual(find_leaks(document, MACHINE), [])
        self.assertEqual(find_leaks(document, MACHINE, ips=True), ["/host/kernel"])

    def test_the_words_of_a_fixed_set_are_skipped_even_for_a_user_called_local(self) -> None:
        user_local = Sensitive(users=("local",))
        document = {"host": {"kind": "local"}}
        self.assertEqual(find_leaks(document, user_local), ["/host/kind"])
        self.assertEqual(find_leaks(document, user_local, skip=("kind",)), [])


class Logs(unittest.TestCase):
    """A log that is scrubbed keeps every line that the engine-config reader looks for."""

    def personal(self, name: str) -> str:
        """A synthetic log with the machine's own words added to it, as a real run would have them."""
        extra = [
            f"gpu-box-7f3a9c:4242:4242 [0] NCCL INFO Bootstrap: Using eth0:10.20.30.40<0> {TOKEN}",
            f"(EngineCore pid=1002) INFO 11-09 12:00:02 [loader.py:51] Loading weights from {HOME}/.cache/huggingface/hub/models--Qwen--Qwen3-0.6B for learnerq8",
            "(EngineCore pid=1002) INFO 11-09 12:00:03 [cuda.py:60] Visible devices: GPU-0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0 at 00000000:01:00.0, sw0rdf1sh-value",
        ]
        return vllm_text(name) + "\n".join(extra) + "\n"

    def test_every_personal_word_goes(self) -> None:
        cleaned, count = scrub_text(self.personal("mrv2-default.txt"), sensitive=MACHINE, kit_root="/opt/example-kit")
        for needle in (HOME, "learnerq8", "gpu-box-7f3a9c", "10.20.30.40", TOKEN, "0f1e2d3c", "00000000:01:00.0", "sw0rdf1sh-value"):
            self.assertNotIn(needle, cleaned)
        self.assertGreater(count, 8)

    def test_the_reading_of_a_scrubbed_log_is_the_reading_of_the_log(self) -> None:
        for name in ("mrv2-default.txt", "mrv1-custom-proposer.txt", "downgrade.txt", "enforce-eager.txt"):
            raw = self.personal(name)
            cleaned = scrub_text(raw, sensitive=MACHINE, kit_root="/opt/example-kit")[0]
            self.assertNotEqual(raw, cleaned)
            before, after = read_engine_config(EngineRun(raw)), read_engine_config(EngineRun(cleaned))
            self.assertEqual((before.found, before.missing, before.evidence), (after.found, after.missing, after.evidence), name)

    def test_the_machine_scrubs_with_its_own_names_by_default(self) -> None:
        users = [user for user in redact.Sensitive.from_machine().users if len(user) >= redact.MIN_LITERAL_CHARS]
        if users:  # a machine whose user is not a generic account, such as a container's root
            self.assertIn(scrub_text(f"by {users[0]} here")[0], ("by <user> here", "by <host> here"))


if __name__ == "__main__":
    unittest.main()
