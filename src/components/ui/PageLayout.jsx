import { cn } from "@/lib/utils"

function PageLayout({
  title,
  description,
  actions,
  children,
  className,
  headerClassName,
  contentClassName,
  fullHeight = true,
  ...props
}) {
  return (
    <div
      className={cn(
        fullHeight ? "min-h-screen" : "min-h-full",
        "bg-background text-neutral-900",
      )}
    >
      <div
        className={cn(
          "mx-auto flex w-full max-w-5xl flex-col px-md py-lg sm:px-lg lg:px-xl",
          fullHeight ? "min-h-screen" : "min-h-full",
          className,
        )}
        {...props}
      >
        {(title || description || actions) && (
          <header
            className={cn(
              "flex flex-col gap-sm pb-md sm:flex-row sm:items-end sm:justify-between",
              headerClassName,
            )}
          >
            <div className="space-y-xs">
              {title ? <h1 className="text-title-lg font-semibold text-neutral-900">{title}</h1> : null}
              {description ? (
                <p className="max-w-2xl text-body-md text-neutral-600">{description}</p>
              ) : null}
            </div>
            {actions ? <div className="mt-sm sm:mt-0 sm:flex-shrink-0">{actions}</div> : null}
          </header>
        )}
        <main className={cn("flex-1 space-y-lg", contentClassName)}>{children}</main>
      </div>
    </div>
  )
}

export default PageLayout
