# PDFMathTranslate Next API 请求文档

## 概述

PDFMathTranslate Next 是一个基于 FastAPI 的 PDF 翻译服务，支持将 PDF 文档翻译成多种语言，并保持原有的格式、公式、图表等元素。

## 服务信息

- **服务名称**: PDFMathTranslate Next REST API
- **版本**: 1.0.0
- **默认端口**: 7861
- **基础路径**: `/v1`

## API 端点

### 1. 提交翻译任务

**端点**: `POST /v1/translate`

**描述**: 提交一个 PDF 文件进行翻译

**请求参数**:
- `file` (multipart/form-data): PDF 文件（必需）
- `data` (form-data, 可选): JSON 字符串格式的配置参数

**配置参数示例**:
```json
{
  "translation.lang_in": "en",
  "translation.lang_out": "zh",
  "translation.qps": 4,
  "translation.ignore_cache": false,
  "pdf.pages": "1-10",
  "pdf.no_dual": false,
  "pdf.no_mono": false,
  "translate_engine_settings": {
    "translate_engine_type": "GenericAPI",
    "generic_api_url": "http://your-translation-service.com/translate",
    "generic_api_method": "POST",
    "generic_api_headers": "{\"Content-Type\": \"application/json\", \"Authorization\": \"Bearer your-token\"}",
    "generic_api_body": "{\"text\": \"{text}\", \"source\": \"{lang_in}\", \"target\": \"{lang_out}\"}",
    "generic_api_body_type": "json",
    "generic_api_extract_json_path": "data.translation",
    "generic_api_timeout": "30"
  }
}
```

**cURL 示例**:
```bash
curl -X POST "http://localhost:7861/v1/translate" \
  -F "file=@example.pdf" \
  -F 'data={"translation.lang_in":"en","translation.lang_out":"zh","translate_engine_settings":{"translate_engine_type":"GenericAPI","generic_api_url":"http://your-service.com/translate","generic_api_method":"POST","generic_api_headers":"{\"Content-Type\": \"application/json\"}","generic_api_body":"{\"text\": \"{text}\", \"source\": \"{lang_in}\", \"target\": \"{lang_out}\"}","generic_api_body_type":"json","generic_api_extract_json_path":"data.translation"}}'
```

**响应示例**:
```json
{
  "id": "d9894125-2f4e-45ea-9d93-1a9068d2045a"
}
```

### 2. 查询任务状态

**端点**: `GET /v1/translate/{job_id}`

**描述**: 查询指定翻译任务的状态和进度

**路径参数**:
- `job_id` (string): 任务ID

**cURL 示例**:
```bash
curl "http://localhost:7861/v1/translate/d9894125-2f4e-45ea-9d93-1a9068d2045a"
```

**响应示例**:

进行中:
```json
{
  "id": "d9894125-2f4e-45ea-9d93-1a9068d2045a",
  "state": "PROGRESS",
  "info": {
    "stage": "translating",
    "overall_progress": 0.3,
    "part_index": 1,
    "total_parts": 3,
    "stage_current": 10,
    "stage_total": 50
  },
  "error": null,
  "mono_pdf_path": null,
  "dual_pdf_path": null,
  "glossary_path": null
}
```

完成:
```json
{
  "id": "d9894125-2f4e-45ea-9d93-1a9068d2045a",
  "state": "SUCCESS",
  "info": null,
  "error": null,
  "mono_pdf_path": "/app/pdf2zh_jobs/d9894125-2f4e-45ea-9d93-1a9068d2045a/example-mono.pdf",
  "dual_pdf_path": "/app/pdf2zh_jobs/d9894125-2f4e-45ea-9d93-1a9068d2045a/example-dual.pdf",
  "glossary_path": "/app/pdf2zh_jobs/d9894125-2f4e-45ea-9d93-1a9068d2045a/example-glossary.csv"
}
```

错误:
```json
{
  "id": "d9894125-2f4e-45ea-9d93-1a9068d2045a",
  "state": "ERROR",
  "info": null,
  "error": "Translation service error: API key invalid",
  "mono_pdf_path": null,
  "dual_pdf_path": null,
  "glossary_path": null
}
```

### 3. 下载单语PDF

**端点**: `GET /v1/translate/{job_id}/mono`

**描述**: 下载翻译后的单语PDF文件

**路径参数**:
- `job_id` (string): 任务ID

**cURL 示例**:
```bash
curl "http://localhost:7861/v1/translate/d9894125-2f4e-45ea-9d93-1a9068d2045a/mono" \
  --output example-mono.pdf
```

### 4. 下载双语PDF

**端点**: `GET /v1/translate/{job_id}/dual`

**描述**: 下载翻译后的双语PDF文件（原文和译文对照）

**路径参数**:
- `job_id` (string): 任务ID

**cURL 示例**:
```bash
curl "http://localhost:7861/v1/translate/d9894125-2f4e-45ea-9d93-1a9068d2045a/dual" \
  --output example-dual.pdf
```

### 5. 下载词汇表

**端点**: `GET /v1/translate/{job_id}/glossary`

**描述**: 下载自动提取的词汇表CSV文件

**路径参数**:
- `job_id` (string): 任务ID

**cURL 示例**:
```bash
curl "http://localhost:7861/v1/translate/d9894125-2f4e-45ea-9d93-1a9068d2045a/glossary" \
  --output example-glossary.csv
```

### 6. 取消任务

**端点**: `DELETE /v1/translate/{job_id}`

**描述**: 取消正在进行的翻译任务

**路径参数**:
- `job_id` (string): 任务ID

**cURL 示例**:
```bash
curl -X DELETE "http://localhost:7861/v1/translate/d9894125-2f4e-45ea-9d93-1a9068d2045a"
```

**响应示例**:
```json
{
  "ok": true
}
```

## 配置参数详解

### 翻译设置 (translation)

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `lang_in` | string | "en" | 源语言代码 |
| `lang_out` | string | "zh" | 目标语言代码 |
| `qps` | integer | 4 | 翻译服务QPS限制 |
| `ignore_cache` | boolean | false | 是否忽略翻译缓存 |
| `min_text_length` | integer | 5 | 最小翻译文本长度 |
| `custom_system_prompt` | string | null | 自定义系统提示词 |
| `glossaries` | string | null | 词汇表文件列表 |
| `save_auto_extracted_glossary` | boolean | false | 是否保存自动提取的词汇表 |
| `pool_max_workers` | integer | null | 翻译池最大工作线程数 |
| `no_auto_extract_glossary` | boolean | false | 是否禁用自动提取词汇表 |
| `primary_font_family` | string | null | 主要字体族（serif/sans-serif/script） |

### PDF设置 (pdf)

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `pages` | string | null | 要翻译的页面（如 "1,2,1-,-3,3-5"） |
| `no_dual` | boolean | false | 不输出双语PDF |
| `no_mono` | boolean | false | 不输出单语PDF |
| `split_short_lines` | boolean | false | 强制分割短行 |
| `short_line_split_factor` | float | 0.8 | 短行分割阈值因子 |
| `skip_clean` | boolean | false | 跳过PDF清理步骤 |
| `dual_translate_first` | boolean | false | 双语PDF中译文页面在前 |
| `disable_rich_text_translate` | boolean | false | 禁用富文本翻译 |
| `enhance_compatibility` | boolean | false | 启用所有兼容性增强选项 |
| `use_alternating_pages_dual` | boolean | false | 双语PDF使用交替页面模式 |
| `watermark_output_mode` | string | "watermarked" | 水印输出模式（watermarked/no_watermark/both） |
| `max_pages_per_part` | integer | null | 分块翻译的最大页面数 |
| `translate_table_text` | boolean | true | 翻译表格文本（实验性） |
| `skip_scanned_detection` | boolean | false | 跳过扫描检测 |
| `ocr_workaround` | boolean | false | OCR工作区修复 |
| `auto_enable_ocr_workaround` | boolean | false | 自动启用OCR工作区修复 |
| `only_include_translated_page` | boolean | false | 仅包含翻译的页面 |

### 翻译引擎设置

#### GenericAPI 设置

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `translate_engine_type` | string | "GenericAPI" | 翻译引擎类型 |
| `support_llm` | string | "no" | 是否支持LLM |
| `generic_api_model` | string | "generic" | 逻辑模型名称 |
| `generic_api_url` | string | null | API端点URL，支持占位符 {text}, {lang_in}, {lang_out} |
| `generic_api_method` | string | "POST" | HTTP方法 |
| `generic_api_headers` | string | null | HTTP头部JSON字符串，支持占位符 |
| `generic_api_params` | string | null | 查询参数JSON字符串，支持占位符 |
| `generic_api_body` | string | null | 请求体模板，支持占位符 |
| `generic_api_body_type` | string | "json" | 请求体类型（json/form/raw） |
| `generic_api_timeout` | string | null | 超时时间（秒） |
| `generic_api_extract_json_path` | string | null | 从JSON响应中提取翻译的路径（如 data.result.text） |

#### Dify 设置

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `translate_engine_type` | string | "Dify" | 翻译引擎类型 |
| `dify_url` | string | null | Dify URL |
| `dify_apikey` | string | null | Dify API Key |

## 状态码说明

| 状态码 | 描述 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 404 | 任务不存在 |
| 409 | 文件未准备就绪 |
| 410 | 文件不存在 |
| 500 | 服务器内部错误 |

## 任务状态说明

| 状态 | 描述 |
|------|------|
| PENDING | 任务等待中 |
| PROGRESS | 任务进行中 |
| SUCCESS | 任务成功完成 |
| ERROR | 任务执行失败 |
| CANCELLED | 任务已取消 |

## 使用示例

### Python 客户端示例

```python
import requests
import time
import json

# 提交翻译任务
def submit_translation(pdf_file_path, config=None):
    url = "http://localhost:7861/v1/translate"
    
    with open(pdf_file_path, 'rb') as f:
        files = {'file': f}
        data = {'data': json.dumps(config) if config else None}
        
        response = requests.post(url, files=files, data=data)
        return response.json()

# 查询任务状态
def get_job_status(job_id):
    url = f"http://localhost:7861/v1/translate/{job_id}"
    response = requests.get(url)
    return response.json()

# 下载结果文件
def download_file(job_id, file_type):
    url = f"http://localhost:7861/v1/translate/{job_id}/{file_type}"
    response = requests.get(url)
    return response.content

# 使用示例
config = {
    "translation.lang_in": "en",
    "translation.lang_out": "zh",
    "translate_engine_settings": {
        "translate_engine_type": "GenericAPI",
        "generic_api_url": "http://your-translation-service.com/translate",
        "generic_api_method": "POST",
        "generic_api_headers": '{"Content-Type": "application/json"}',
        "generic_api_body": '{"text": "{text}", "source": "{lang_in}", "target": "{lang_out}"}',
        "generic_api_body_type": "json",
        "generic_api_extract_json_path": "data.translation"
    }
}

# 提交任务
result = submit_translation("example.pdf", config)
job_id = result["id"]
print(f"任务ID: {job_id}")

# 轮询状态
while True:
    status = get_job_status(job_id)
    print(f"状态: {status['state']}")
    
    if status["state"] == "SUCCESS":
        # 下载结果文件
        mono_pdf = download_file(job_id, "mono")
        dual_pdf = download_file(job_id, "dual")
        glossary = download_file(job_id, "glossary")
        
        with open("translated-mono.pdf", "wb") as f:
            f.write(mono_pdf)
        with open("translated-dual.pdf", "wb") as f:
            f.write(dual_pdf)
        with open("glossary.csv", "wb") as f:
            f.write(glossary)
        
        print("翻译完成！")
        break
    elif status["state"] == "ERROR":
        print(f"翻译失败: {status['error']}")
        break
    
    time.sleep(2)
```

### JavaScript 客户端示例

```javascript
// 提交翻译任务
async function submitTranslation(pdfFile, config) {
    const formData = new FormData();
    formData.append('file', pdfFile);
    if (config) {
        formData.append('data', JSON.stringify(config));
    }
    
    const response = await fetch('http://localhost:7861/v1/translate', {
        method: 'POST',
        body: formData
    });
    
    return await response.json();
}

// 查询任务状态
async function getJobStatus(jobId) {
    const response = await fetch(`http://localhost:7861/v1/translate/${jobId}`);
    return await response.json();
}

// 下载文件
async function downloadFile(jobId, fileType) {
    const response = await fetch(`http://localhost:7861/v1/translate/${jobId}/${fileType}`);
    return await response.blob();
}

// 使用示例
const config = {
    "translation.lang_in": "en",
    "translation.lang_out": "zh",
    "translate_engine_settings": {
        "translate_engine_type": "GenericAPI",
        "generic_api_url": "http://your-translation-service.com/translate",
        "generic_api_method": "POST",
        "generic_api_headers": '{"Content-Type": "application/json"}',
        "generic_api_body": '{"text": "{text}", "source": "{lang_in}", "target": "{lang_out}"}',
        "generic_api_body_type": "json",
        "generic_api_extract_json_path": "data.translation"
    }
};

// 处理文件上传
document.getElementById('fileInput').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (file) {
        const result = await submitTranslation(file, config);
        const jobId = result.id;
        console.log(`任务ID: ${jobId}`);
        
        // 轮询状态
        const pollStatus = async () => {
            const status = await getJobStatus(jobId);
            console.log(`状态: ${status.state}`);
            
            if (status.state === 'SUCCESS') {
                // 下载结果文件
                const monoPdf = await downloadFile(jobId, 'mono');
                const dualPdf = await downloadFile(jobId, 'dual');
                const glossary = await downloadFile(jobId, 'glossary');
                
                // 创建下载链接
                const monoUrl = URL.createObjectURL(monoPdf);
                const dualUrl = URL.createObjectURL(dualPdf);
                const glossaryUrl = URL.createObjectURL(glossary);
                
                // 触发下载
                const monoLink = document.createElement('a');
                monoLink.href = monoUrl;
                monoLink.download = 'translated-mono.pdf';
                monoLink.click();
                
                const dualLink = document.createElement('a');
                dualLink.href = dualUrl;
                dualLink.download = 'translated-dual.pdf';
                dualLink.click();
                
                const glossaryLink = document.createElement('a');
                glossaryLink.href = glossaryUrl;
                glossaryLink.download = 'glossary.csv';
                glossaryLink.click();
                
                console.log('翻译完成！');
            } else if (status.state === 'ERROR') {
                console.error(`翻译失败: ${status.error}`);
            } else {
                setTimeout(pollStatus, 2000);
            }
        };
        
        pollStatus();
    }
});
```

## 注意事项

1. **文件大小限制**: 建议单个PDF文件不超过100MB
2. **并发限制**: 默认QPS为4，可根据翻译服务能力调整
3. **存储空间**: 确保有足够的磁盘空间存储翻译结果
4. **网络超时**: 大文件翻译可能需要较长时间，建议设置合适的超时时间
5. **错误处理**: 建议实现重试机制和错误处理逻辑
6. **安全性**: 生产环境中建议添加身份验证和访问控制

## 支持的语言代码

请参考 [语言代码文档](https://pdf2zh-next.com/advanced/Language-Codes.html) 获取完整的支持语言列表。

## 故障排除

### 常见问题

1. **任务一直处于PENDING状态**
   - 检查翻译服务是否正常运行
   - 验证API配置是否正确

2. **翻译失败**
   - 检查PDF文件是否损坏
   - 验证翻译服务API密钥和配置
   - 查看错误信息进行诊断

3. **下载文件失败**
   - 确保任务状态为SUCCESS
   - 检查文件是否已生成

4. **服务启动失败**
   - 检查端口是否被占用
   - 验证依赖是否正确安装
   - 查看服务日志获取详细错误信息

这份文档涵盖了 PDFMathTranslate Next API 的所有主要功能和使用方法。如果您需要更详细的信息或有其他问题，请参考项目的官方文档或提交Issue。