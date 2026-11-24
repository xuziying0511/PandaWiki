package usecase

import (
	"strings"
	"testing"

	"github.com/chaitin/panda-wiki/domain"
)

func TestCitedAnswerImagesFromPublishedDocument(t *testing.T) {
	answer := "点击【新建】。\n\n---\n### 参考文档\n> [1]. [如何添加账号？](https://wiki.example/node/account)"
	nodes := []*domain.RankedNodeChunks{
		{NodeID: "unrelated", SourceContent: "![另一张图](/static-file/unrelated.png)"},
		{
			NodeID:        "account",
			Chunks:        []*domain.NodeContentChunk{{Content: "点击【新建】。"}},
			SourceContent: `<p>点击【新建】。</p><img src="/static-file/account.png">`,
		},
	}

	addition := citedAnswerImages(answer, nodes)
	if !strings.Contains(addition, "/static-file/account.png") || strings.Contains(addition, "unrelated.png") {
		t.Fatalf("unexpected image addition: %q", addition)
	}
	if refs := extractReferencesBlock("", "", answer+addition); len(refs) != 1 {
		t.Fatalf("expected the saved answer to retain one reference, got %d", len(refs))
	}

	alreadyHasImage := "![账号截图](https://wiki.example/static-file/account.png)\n\n" + answer
	if addition := citedAnswerImages(alreadyHasImage, nodes); addition != "" {
		t.Fatalf("expected no duplicate image, got %q", addition)
	}
}
