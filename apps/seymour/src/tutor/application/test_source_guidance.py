import pytest

from src.tutor.application.guidance import Guidance, render
from src.tutor.application.guidance import grounding as answer_grounding

pytestmark = pytest.mark.unit

PDF = "11111111-1111-4111-8111-111111111111"


NOTES = "22222222-2222-4222-8222-222222222222"


def excerpt(text, page, start, source=PDF):
    return {
        "sourceId": source,
        "cite": f"Usadosbr API.pdf, p. {page}",
        "location": {"page": page},
        "start": start,
        "text": text,
    }


def guidance(first="", last="", sources=()):
    return Guidance(
        explanation="This is the documented payload.",
        quote_from=first,
        quote_to=last,
        next_step="Send it to the homologation URL.",
        question="Which field identifies the vehicle?",
        sources=list(sources),
    )


def shown(guidance_value, excerpts):
    """Renders for a learner who asked to see source text."""
    return render(guidance_value, excerpts, "Show me the example")


def quote_of(citations):
    quoted = [citation["quote"] for citation in citations if citation["quote"]]

    return quoted[0] if quoted else None


def test_quotes_are_copied_by_the_server_even_across_a_page_break():
    page_four = 'Exemplo de um JSON válido:\n {\n   "Operacao": "Adicionar",'
    page_five = '   "Placa": "XXX-9999"\n }'
    excerpts = [excerpt(page_four, 4, 100), excerpt(page_five, 5, 900)]

    # The model may change spacing in the markers; the copied text keeps the source's.
    text, citations = shown(guidance('"Operacao":"Adicionar",', ' "Placa": "XXX-9999"'), excerpts)

    assert quote_of(citations) == '   "Operacao": "Adicionar",\n   "Placa": "XXX-9999"'
    assert [citation["cite"] for citation in citations] == [
        "Usadosbr API.pdf, p. 4",
        "Usadosbr API.pdf, p. 5",
    ]
    assert citations[1]["location"] == {"page": 5}
    assert "Placa" not in text


def test_unknown_markers_and_invented_citations_show_nothing():
    excerpts = [excerpt('{\n  "Operacao": "Adicionar"\n}', 4, 0)]

    _text, citations = shown(
        guidance('"Operacao": "Remover"', "}", ["Invented.pdf, p. 1"]), excerpts
    )

    assert citations == []


def test_overlapping_chunks_are_quoted_once_and_long_quotes_are_cut_at_a_line():
    first = "line 1\nline 2\nline 3"
    overlapping = "line 3\nline 4"
    long_lines = "\n".join(f"row {index} " + "x" * 60 for index in range(40))

    _text, overlap_citations = shown(
        guidance("line 1", "line 4"), [excerpt(first, 1, 0), excerpt(overlapping, 1, 14)]
    )
    _text, long_citations = shown(guidance("row 0", "row 39"), [excerpt(long_lines, 2, 0)])

    overlap = quote_of(overlap_citations)
    long = quote_of(long_citations)

    assert overlap == "line 1\nline 2\nline 3\nline 4"
    assert "row 39" not in long
    assert long.endswith("\n...")


def test_quotes_never_span_two_documents():
    excerpts = [excerpt("start here", 1, 0, PDF), excerpt("end here", 1, 0, NOTES)]

    _text, citations = shown(guidance("start here", "end here"), excerpts)

    assert quote_of(citations) is None


def test_citation_prefixes_multi_line_markers_and_excerpt_pointers_are_tolerated():
    page = 'Objetivo\n\nPOST /login\n {\n   "user": "user"\n }\n\nLimite de requisições'
    excerpts = [excerpt(page, 1, 0)]

    example = 'POST /login\n {\n   "user": "user"\n }'

    _text, prefixed = shown(guidance("Usadosbr API.pdf, p. 1: POST /login", " }"), excerpts)
    _text, multi_line = shown(guidance('POST /login\n {\n "user"', ' "user": "user"\n }'), excerpts)
    _text, cite_only = shown(guidance("Usadosbr API.pdf, p. 1", "Usadosbr API.pdf, p. 1"), excerpts)

    assert quote_of(prefixed) == example
    assert quote_of(multi_line) == example
    assert quote_of(cite_only) == example


def test_pointing_at_an_excerpt_without_an_example_shows_nothing():
    excerpts = [excerpt("Objetivo\n\nA API integra anúncios.", 1, 0)]

    _text, citations = shown(guidance("Usadosbr API.pdf, p. 1", ""), excerpts)

    assert quote_of(citations) is None


def test_unrelated_quotes_are_dropped_unless_the_learner_asked_to_see_text():
    page = 'Replay window: at most 37 pending envelopes.\n{\n  "leaseTag": "QUARTZ"\n}'
    excerpts = [excerpt(page, 1, 0)]
    pointing_at_json = Guidance(
        explanation="The replay window accepts at most 37 pending envelopes.",
        quote_from="{",
        quote_to="}",
        next_step="Enforce the cap.",
        question="Where do you check it?",
        sources=["Usadosbr API.pdf, p. 1"],
    )

    _text, limit_question = render(pointing_at_json, excerpts, "What is the envelope limit?")
    _text, show_request = render(pointing_at_json, excerpts, "Show me the request example")
    backing_guidance = pointing_at_json.model_copy(
        update={"quote_from": "Replay window", "quote_to": "envelopes."}
    )
    _text, backing = render(backing_guidance, excerpts, "What is the cap?")

    assert quote_of(limit_question) is None
    assert limit_question[0]["cite"] == "Usadosbr API.pdf, p. 1"
    assert quote_of(show_request) == '{\n  "leaseTag": "QUARTZ"\n}'
    assert quote_of(backing) == "Replay window: at most 37 pending envelopes."


def test_stated_facts_cite_their_excerpt_when_the_model_lists_no_sources():
    legacy = excerpt("The legacy bridge batch cap is 23 records.", 2, 0)
    other = excerpt("Ports listen on 18473.", 3, 0)
    answered = Guidance(
        explanation="You can put up to 23 records in one legacy bridge batch.",
        next_step="Enforce the cap.",
        question="Where do you slice the batch?",
    )
    echoed = answered.model_copy(update={"explanation": "I could not find batch 23 in the notes."})

    _text, citations = render(answered, [legacy, other], "How many records fit in one batch?")
    _text, echo_citations = render(echoed, [legacy], "Is batch 23 documented?")

    assert [citation["cite"] for citation in citations] == ["Usadosbr API.pdf, p. 2"]
    assert echo_citations == []


def test_answers_not_found_in_sources_cite_nothing():
    legacy = excerpt("The replay window accepts at most 37 pending envelopes.", 1, 0)
    not_found = Guidance(
        explanation="I cannot find pricing; the excerpts cover the replay window (37) only.",
        next_step="Check for a pricing document.",
        question="Do you have one?",
        sources=["Usadosbr API.pdf, p. 1"],
        answered_from_sources=False,
    )

    _text, citations = render(not_found, [legacy], "How much does a subscription cost?")
    support = answer_grounding(True, citations)

    assert citations == []
    assert support == {"support": "unsupported", "citations": []}
