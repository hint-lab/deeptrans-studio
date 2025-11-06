import { cookies } from "next/headers"
import { Mail } from "./components/mail"
import { accounts, mails } from "./data"


interface Collapsed {
  value?: string;
}

interface ComponentProps {
  collapsed?: Collapsed;
}

function isValidJSON(str: string | undefined): boolean {
  if (!str) {
    return false;
  }
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
}

export default function MailPage() {
  const layout = cookies().get("react-resizable-panels:layout")
  const collapsed = cookies().get("react-resizable-panels:collapsed")
  console.log(layout)
  console.log(collapsed)
  const defaultLayout = layout ? JSON.parse(layout.value) : undefined
  const defaultCollapsed = isValidJSON(collapsed?.value) ? JSON.parse(collapsed!.value!) : undefined;

  return (
    <>

      <div className="hidden flex-col md:flex">
        <Mail
          accounts={accounts}
          mails={mails}
          defaultLayout={defaultLayout}
          defaultCollapsed={defaultCollapsed}
          navCollapsedSize={4}
        />
      </div>
    </>
  )
}
