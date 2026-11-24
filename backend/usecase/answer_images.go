package usecase

import (
	"bytes"
	"net/url"
	"strings"

	"github.com/yuin/goldmark"
	mdhtml "github.com/yuin/goldmark/renderer/html"
	"golang.org/x/net/html"

	"github.com/chaitin/panda-wiki/domain"
)

const answerImagesHeading = "\n\n### 相关图片\n\n"

func citedAnswerImages(answer string, nodes []*domain.RankedNodeChunks) string {
	if _, visible, ok := strings.Cut(answer, "</think>"); ok {
		answer = visible
	}
	refs := extractReferencesBlock("", "", answer)
	if len(refs) == 0 {
		return ""
	}

	ranked := make(map[string]*domain.RankedNodeChunks, len(nodes))
	for _, node := range nodes {
		ranked[node.GetURL("")] = node
	}
	seen := make(map[string]bool)
	for _, src := range answerImageURLs(answer) {
		seen[answerImageKey(src)] = true
	}

	var images []string
	for _, ref := range refs {
		link, err := url.Parse(ref.URL)
		if err != nil {
			continue
		}
		node := ranked[link.Path]
		if node == nil {
			continue
		}

		var sources []string
		for _, chunk := range node.Chunks {
			sources = append(sources, answerImageURLs(chunk.Content)...)
		}
		if len(sources) == 0 {
			// A single image in the cited document can survive a text-only retrieval hit.
			documentImages := answerImageURLs(node.SourceContent)
			if len(documentImages) == 1 {
				sources = documentImages
			}
		}
		for _, src := range sources {
			key := answerImageKey(src)
			if !seen[key] {
				seen[key] = true
				images = append(images, "![文档配图](<"+src+">)")
			}
		}
	}
	if len(images) == 0 {
		return ""
	}
	return answerImagesHeading + strings.Join(images, "\n\n")
}

func answerImageURLs(markdown string) []string {
	var rendered bytes.Buffer
	if err := goldmark.New(goldmark.WithRendererOptions(mdhtml.WithUnsafe())).Convert([]byte(markdown), &rendered); err != nil {
		return nil
	}
	tokens := html.NewTokenizer(&rendered)
	var sources []string
	for kind := tokens.Next(); kind != html.ErrorToken; kind = tokens.Next() {
		if kind != html.StartTagToken && kind != html.SelfClosingTagToken {
			continue
		}
		token := tokens.Token()
		if token.Data != "img" {
			continue
		}
		for _, attr := range token.Attr {
			if attr.Key != "src" || strings.ContainsAny(attr.Val, "<>\\\r\n\t") {
				continue
			}
			src, err := url.Parse(attr.Val)
			if err != nil {
				continue
			}
			if ((src.Scheme == "http" || src.Scheme == "https") && src.Host != "") ||
				(src.Host == "" && src.Scheme == "" && strings.HasPrefix(src.Path, "/static-file/")) {
				sources = append(sources, src.String())
			}
		}
	}
	return sources
}

func answerImageKey(src string) string {
	parsed, _ := url.Parse(src)
	if strings.HasPrefix(parsed.Path, "/static-file/") {
		return parsed.RequestURI()
	}
	return src
}
