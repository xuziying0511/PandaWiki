package domain

// 用户反馈请求
type FeedbackRequest struct {
	ConversationId  string       `json:"conversation_id"`
	MessageId       string       `json:"message_id" validate:"required"`
	Score           ScoreType    `json:"score"`                               // 0 未评价，1/-1 历史赞踩，2 部分解决，3 已解决，4 未解决
	Type            FeedbackType `json:"type"`                                // 内容不准确，没有帮助，.......
	FeedbackContent string       `json:"feedback_content" validate:"max=200"` //限制内容长度
}

type FeedbackType string

type ScoreType int

// 0 表示未评价；兼容原点赞（1）和点踩（-1）记录。
const (
	Like              ScoreType = 1
	DisLike           ScoreType = -1
	PartiallyResolved ScoreType = 2
	Resolved          ScoreType = 3
	Unresolved        ScoreType = 4
)
