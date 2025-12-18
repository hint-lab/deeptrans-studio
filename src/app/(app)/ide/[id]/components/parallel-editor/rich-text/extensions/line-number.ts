import { Extension } from '@tiptap/core';

export interface LineNumberOptions {
    showLineNumbers: boolean;
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        lineNumber: {
            toggleLineNumbers: () => ReturnType;
        };
    }
}

const LineNumber = Extension.create<LineNumberOptions>({
    name: 'lineNumber',

    addOptions() {
        return {
            showLineNumbers: true,
        };
    },

    // 添加存储，使方法在整个扩展中可用
    addStorage() {
        return {
            updateLineNumbers: (editor: any) => {
                if (!this.options.showLineNumbers) return;

                const { view } = editor;
                const editorDOM = view.dom;
                const parentElement = editorDOM.parentElement;

                if (!parentElement) return;

                // 获取编辑器容器
                const editorContainer = parentElement.parentElement;
                if (!editorContainer) return;

                // 获取或创建行号容器
                let lineNumbersElement = editorContainer.querySelector('.line-numbers-container');
                if (!lineNumbersElement) {
                    lineNumbersElement = document.createElement('div');
                    lineNumbersElement.className =
                        'line-numbers-container absolute left-0 top-0 h-full w-8 bg-muted text-muted-foreground text-xs';
                    editorContainer.insertBefore(lineNumbersElement, parentElement);
                }

                // 清空现有行号
                lineNumbersElement.innerHTML = '';

                // 创建行号标记函数
                const createLineMarker = (top: number, lineNum: number) => {
                    const marker = document.createElement('div');
                    marker.className = 'line-number';
                    marker.textContent = lineNum.toString();
                    marker.style.position = 'absolute';
                    marker.style.top = `${top}px`;
                    marker.style.right = '4px';
                    marker.style.left = '0';
                    marker.style.textAlign = 'right';
                    return marker;
                };

                // 获取所有块级元素
                const blocks = editorDOM.querySelectorAll(
                    'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre'
                );

                // 计算实际行位置
                let lineNumber = 1;

                blocks.forEach((block: HTMLElement) => {
                    // 获取元素位置和高度
                    const blockRect = block.getBoundingClientRect();
                    const editorRect = editorDOM.getBoundingClientRect();

                    // 计算相对于编辑器的顶部位置
                    const relativeTop = blockRect.top - editorRect.top;

                    // 添加第一行的行号
                    lineNumbersElement.appendChild(createLineMarker(relativeTop, lineNumber++));

                    // 获取计算样式
                    const style = window.getComputedStyle(block);
                    const lineHeight = parseInt(style.lineHeight) || blockRect.height;

                    // 如果块高度大于行高，则有多行
                    if (blockRect.height > lineHeight * 1.5) {
                        // 计算额外行数(向下取整，因为第一行已添加)
                        const additionalLines = Math.floor(
                            (blockRect.height - lineHeight / 2) / lineHeight
                        );

                        // 为每一额外行添加行号
                        for (let i = 1; i <= additionalLines; i++) {
                            const topPosition = relativeTop + i * lineHeight;
                            lineNumbersElement.appendChild(
                                createLineMarker(topPosition, lineNumber++)
                            );
                        }
                    }
                });
            },
        };
    },

    addCommands() {
        return {
            toggleLineNumbers:
                () =>
                ({ editor }) => {
                    this.options.showLineNumbers = !this.options.showLineNumbers;
                    const editorElement = editor.view.dom.parentElement;
                    if (editorElement) {
                        if (this.options.showLineNumbers) {
                            editorElement.classList.add('show-line-numbers');
                            this.storage.updateLineNumbers(editor);
                        } else {
                            editorElement.classList.remove('show-line-numbers');
                        }
                    }
                    return true;
                },
        };
    },

    onCreate() {
        this.storage.updateLineNumbers(this.editor);
    },

    onUpdate() {
        this.storage.updateLineNumbers(this.editor);
    },
});

export default LineNumber;
