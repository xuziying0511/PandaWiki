package usecase

import "testing"

// The reference format required by domain.SystemDefaultPrompt must be parseable by extractReferencesBlock.
func TestExtractReferencesBlock_DefaultPromptFormat(t *testing.T) {
	answer := `进入【合同意向】页面查看日志即可确认推送状态。

---
### 参考文档
> [1]. [合同意向推送IPM说明](https://wiki.example.com/node/abc)
> [2]. [收货单对账](https://wiki.example.com/node/def)
`
	refs := extractReferencesBlock("conv-1", "app-1", answer)
	if len(refs) != 2 {
		t.Fatalf("expected 2 references, got %d", len(refs))
	}
	if refs[0].Name != "合同意向推送IPM说明" || refs[0].URL != "https://wiki.example.com/node/abc" {
		t.Errorf("unexpected first reference: %+v", refs[0])
	}
	if refs[1].ConversationID != "conv-1" || refs[1].AppID != "app-1" {
		t.Errorf("unexpected ids: %+v", refs[1])
	}
}

func TestExtractReferencesBlock_NoReferences(t *testing.T) {
	if refs := extractReferencesBlock("c", "a", "这点目前还无法确认，建议联系商城人工客服核实。"); len(refs) != 0 {
		t.Fatalf("expected no references, got %d", len(refs))
	}
}
