"""Actual official Python SDK 1.27 HTTP compatibility; no Hermes process or model."""
import asyncio, importlib.metadata, json, os
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

async def main():
    assert os.environ['NODE_ENV'] == 'test'
    assert os.environ['BT_TEST_RUN'].startswith('bt-test-')
    assert os.environ['MCP_TEST_URL'].startswith('http://127.0.0.1:')
    assert importlib.metadata.version('mcp') == '1.27.0'
    async with streamablehttp_client(os.environ['MCP_TEST_URL'], headers={'Authorization': 'Bearer ' + os.environ['MCP_TEST_TOKEN']}, terminate_on_close=False) as (read, write, _):
        async with ClientSession(read, write) as session:
            initialized = await session.initialize()
            tools = await session.list_tools()
            names = [tool.name for tool in tools.tools]
            assert 'store_task_get' in names and 'store_task_claim' in names
            assert 'store_task_assign' not in names and 'store_task_review' not in names
            assert all('authVersion' not in tool.inputSchema.get('properties', {}) for tool in tools.tools)
            result = await session.call_tool('store_task_get', {'taskId': os.environ['MCP_TEST_TASK']})
            assert not result.isError
            value = json.loads(result.content[0].text)['taskId'] if not result.structuredContent else result.structuredContent['task']['taskId']
            assert value == os.environ['MCP_TEST_TASK']
            print(json.dumps({'sdk': 'mcp==1.27.0', 'protocol': initialized.protocolVersion, 'actualHttp': True, 'methods': ['initialize', 'tools/list', 'tools/call'], 'hermesInvoked': False, 'modelInvoked': False}))

asyncio.run(main())
