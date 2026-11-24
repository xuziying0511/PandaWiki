const UDESK_CODE = '2476e31b';
const UDESK_LINK = 'https://1500735.s4.udesk.cn/im_client/?web_plugin_id=60650';
const UDESK_SCRIPT = 'https://assets-cli.s4.udesk.cn/im_client/js/udeskApi.js';

type UdeskArgs =
  | ['showPanel']
  | [{ code: string; link: string; targetSelector: string }];
type Udesk = ((...args: UdeskArgs) => void) & { d?: UdeskArgs[] };
type UdeskWindow = Window & { UdeskApiObject?: string; ud?: Udesk };
let udeskReady: Promise<Udesk> | undefined;
export const shouldOfferHumanSupport = (
  question: string,
  answer: string,
  score: number,
) => {
  const intent = question.trim().replace(/[。！？!?]+$/u, '');
  return (
    score === -1 ||
    /^(?:请|帮我|我要|我想|请帮我)?(?:转接?|找|联系)?(?:人工(?:客服|坐席)?|客服)(?:吧|吗|可以吗)?$/u.test(
      intent,
    ) ||
    /^(?:试过了[，, ]*)?(?:没解决|没有解决|未解决|还是不行)$/u.test(intent) ||
    /无法回答|无法解决|不能解决|请联系[^，。\n]*人工客服|需要[^，。\n]*客服(?:核实|处理)/u.test(
      answer,
    )
  );
};
export const openUdesk = async () => {
  const browser = window as UdeskWindow;
  if (!udeskReady) {
    udeskReady = new Promise<Udesk>((resolve, reject) => {
      const targetId = 'zhixiaocai-udesk-target';
      if (!document.getElementById(targetId)) {
        const target = document.createElement('span');
        target.id = targetId;
        target.style.setProperty('display', 'none', 'important');
        document.body.append(target);
      }
      browser.UdeskApiObject = 'ud';
      if (browser.ud) {
        resolve(browser.ud);
        return;
      }
      const queued: Udesk = (...args) => {
        (queued.d ??= []).push(args);
      };
      browser.ud = queued;
      queued({
        code: UDESK_CODE,
        link: UDESK_LINK,
        targetSelector: '#' + targetId,
      });
      const script = document.createElement('script');
      script.async = true;
      script.src = UDESK_SCRIPT;
      script.onload = () => resolve(browser.ud ?? queued);
      script.onerror = () => {
        if (browser.ud === queued) delete browser.ud;
        script.remove();
        reject(new Error('Udesk script failed to load'));
      };
      document.head.appendChild(script);
    }).catch(error => {
      udeskReady = undefined;
      throw error;
    });
  }
  const ud = await udeskReady;
  ud('showPanel');
};
